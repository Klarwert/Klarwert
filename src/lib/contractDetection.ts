import { getDb } from "@/db/client";
import Database from "@tauri-apps/plugin-sql";
import { suggestCategory } from "@/lib/pipeline/suggest-category";
import { normalizeString as normalize } from "@/lib/stringNormalization";

interface Candidate {
  id: number;
  booking_date: string;
  amount_cents: number;
  counterparty: string;
  purpose: string | null;
  category_id: number | null;
  asset_id: number;
}

/** Token-Overlap zweier Strings (Wort-Ebene). Gibt 0..1 zurück. */
function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) { if (tokensB.has(t)) intersection += 1; }
  return intersection / Math.max(tokensA.size, tokensB.size);
}

function amountsConsistent(amounts: number[]): boolean {
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  return amounts.every((a) => Math.abs(a - avg) <= Math.abs(avg) * 0.05);
}

function averageIntervalDays(dates: string[]): number {
  const sorted = [...dates].sort();
  let total = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    total += (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86_400_000;
  }
  return total / Math.max(sorted.length - 1, 1);
}

function detectIntervalType(avgDays: number): "monthly" | "quarterly" | "yearly" | "irregular" {
  if (avgDays >= 25 && avgDays <= 36) return "monthly";
  if (avgDays >= 80 && avgDays <= 100) return "quarterly";
  if (avgDays >= 350 && avgDays <= 380) return "yearly";
  return "irregular";
}

/**
 * Erkennt neue Verträge/wiederkehrende Zahlungen aus noch nicht zugeordneten Transaktionen
 * eines Kontos und prüft bestehende Verträge auf Preisänderung/Beendigung (Product Spec 4.4).
 *
 * @param assetId   Konto-ID.
 * @param dbOrNull  Optionale offene DB-Connection (aus Import-Transaktion).
 *                  Wenn übergeben, wird diese verwendet – kein eigenes BEGIN/COMMIT!
 */
export async function detectRecurringPatterns(assetId: number, dbOrNull?: Database): Promise<void> {
  const db = dbOrNull ?? (await getDb());

  // Determine reference time for this specific asset
  const maxDateResult = await db.select<{ max_date: string | null }[]>(
    "select max(booking_date) as max_date from transactions where asset_id = $1 and is_deleted = 0",
    [assetId]
  );
  const maxBookingDate = maxDateResult[0]?.max_date;
  if (!maxBookingDate) {
    return; // No transactions found
  }
  const referenceTime = new Date(maxBookingDate).getTime();


  // Preisänderung + Beendigung bestehender Verträge
  const activeContracts = await db.select<
    { id: number; name: string; current_amount_cents: number; interval: string; status: string }[]
  >("select id, name, current_amount_cents, interval, status from contracts where is_deleted = 0 and status not in ('ended', 'paused')");

  for (const contract of activeContracts) {
    const recent = await db.select<{ booking_date: string; amount_cents: number }[]>(
      "select booking_date, amount_cents from transactions where contract_id = $1 and is_deleted = 0 order by booking_date desc limit 1",
      [contract.id],
    );
    const latest = recent[0];
    if (!latest) continue;

    const deviates = Math.abs(latest.amount_cents - contract.current_amount_cents) > Math.abs(contract.current_amount_cents) * 0.05;
    if (deviates && contract.status !== "price_changed") {
      await db.execute(
        "update contracts set status = 'price_changed', previous_amount_cents = $1, current_amount_cents = $2 where id = $3",
        [contract.current_amount_cents, latest.amount_cents, contract.id],
      );
    }

    let maxDaysWithoutBooking = 30 * 2.5; // default monthly
    if (contract.interval === "quarterly") {
      maxDaysWithoutBooking = 90 * 1.5;
    } else if (contract.interval === "yearly") {
      maxDaysWithoutBooking = 365 * 1.25;
    }
    
    const daysSinceLast = (referenceTime - new Date(latest.booking_date).getTime()) / 86_400_000;
    if (daysSinceLast > maxDaysWithoutBooking && contract.status !== "ended" && contract.status !== "suggested_ended") {
      await db.execute("update contracts set status = 'suggested_ended' where id = $1", [contract.id]);
    }
  }

  // Neue Muster aus noch nicht zugeordneten Transaktionen
  const candidates = await db.select<Candidate[]>(
    `select id, asset_id, booking_date, amount_cents, counterparty, purpose, category_id from transactions
     where asset_id = $1 and is_deleted = 0 and is_transfer = 0
       and contract_id is null and recurring_payment_id is null
       and categorization_source != 'manual'`,
    [assetId],
  );

  // Zwei-Pass-Gruppierung gemäß Product Spec 4.4 / R9:
  // 1) Gruppe nach normalisiertem Empfänger.
  // 2) Innerhalb jeder Empfänger-Gruppe: Sub-Gruppe nach Token-Overlap des
  //    Verwendungszwecks (≥70 %). So werden Verträge erkannt, bei denen der
  //    Zweck einen Monatsnamen enthält und sich monatlich ändert (z. B. DKB
  //    Strom-Abschlag: "Abschlag Januar", "Abschlag Februar", …).
  const byCounterparty = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = normalize(c.counterparty);
    const list = byCounterparty.get(key) ?? [];
    list.push(c);
    byCounterparty.set(key, list);
  }

  /** Sub-groups by purpose token-overlap ≥70 % */
  function subGroupByPurpose(group: Candidate[]): Candidate[][] {
    const result: Candidate[][] = [];
    for (const candidate of group) {
      const refPurpose = normalize(candidate.purpose ?? candidate.counterparty);
      let placed = false;
      for (const sub of result) {
        const subRef = normalize(sub[0].purpose ?? sub[0].counterparty);
        if (tokenOverlap(refPurpose, subRef) >= 0.7) {
          sub.push(candidate);
          placed = true;
          break;
        }
      }
      if (!placed) result.push([candidate]);
    }
    return result;
  }

  const groups: { key: string; group: Candidate[] }[] = [];
  for (const [key, grp] of byCounterparty) {
    for (const sub of subGroupByPurpose(grp)) {
      groups.push({ key, group: sub });
    }
  }

  const dismissedNames = new Set(
    (
      await db.select<{ name: string }[]>(
        "select name from contracts where is_dismissed = 1 union select name from recurring_payments where is_dismissed = 1",
      )
    ).map((r: any) => normalize(r.name)),
  );

  for (const { key, group } of groups) {
    if (group.length < 2 || dismissedNames.has(key)) continue;
    const amounts = group.map((g) => g.amount_cents);
    if (!amountsConsistent(amounts)) continue;

    const avgDays = averageIntervalDays(group.map((g) => g.booking_date));
    const intervalType = detectIntervalType(avgDays);
    const latest = [...group].sort((a, b) => (a.booking_date < b.booking_date ? 1 : -1))[0];
    const avgAmount = Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length);
    const displayName = group[0].counterparty.trim();
    const ids = group.map((g) => g.id);
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ");

    let categoryId = group.map(g => g.category_id).find(c => c !== null) ?? null;
    if (categoryId === null) {
      categoryId = await suggestCategory({
        asset_id: latest.asset_id, // we need asset_id on candidate
        counterparty: latest.counterparty,
        purpose: latest.purpose,
        amount_cents: latest.amount_cents,
      }, db);
    }

    if (intervalType !== "irregular") {
      const result = await db.execute(
        `insert into contracts (name, current_amount_cents, interval, status, detection_method, category_id)
         values ($1, $2, $3, 'detected', 'auto', $4)`,
        [displayName, latest.amount_cents, intervalType, categoryId],
      );
      const contractId = result.lastInsertId as number;
      await db.execute(`update transactions set contract_id = $1 where id in (${placeholders})`, [
        contractId,
        ...ids,
      ]);
    } else {
      const result = await db.execute(
        "insert into recurring_payments (name, typical_amount_cents, category_id) values ($1, $2, $3)",
        [displayName, avgAmount, categoryId],
      );
      const paymentId = result.lastInsertId as number;
      await db.execute(`update transactions set recurring_payment_id = $1 where id in (${placeholders})`, [
        paymentId,
        ...ids,
      ]);
    }
  }
}
