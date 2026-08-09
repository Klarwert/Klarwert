import type Database from "@tauri-apps/plugin-sql";
import { normalizeCounterparty } from "@/lib/merchant-match";
import { createOrUpdateNotification } from "@/db/repositories/notifications";

const MIN_OCCURRENCES = 5;

function normalizeIban(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

interface IbanGroup {
  iban: string;
  count: number;
  sampleCounterparty: string;
}

/**
 * Heuristik "Eigene Konten automatisch vorschlagen" (Bugfix-Runde 3, Punkt 4): taucht dieselbe
 * Empfänger-IBAN, die noch keinem eigenen Konto zugeordnet ist, wiederholt auf (>= 5 Buchungen),
 * wird ein dismissable Hinweis erzeugt – nie automatisch ein Konto angelegt, nur vorgeschlagen.
 * Stimmt der zugehörige Empfängername zusätzlich mit einer bekannten Person überein (Alias oder
 * Personenname selbst, case-insensitiv), ist der Vorschlag konkreter formuliert und die App bietet
 * an, das Konto mit vorausgefüllter (nicht editierbarer) IBAN direkt anzulegen.
 */
export async function detectOwnAccountSuggestions(db: Database): Promise<void> {
  const ownIbans = await db.select<{ iban: string }[]>(
    "select iban from assets where is_deleted = 0 and iban is not null",
  );
  const ownIbanSet = new Set(ownIbans.map((r) => normalizeIban(r.iban)));

  const rows = await db.select<{ counterparty: string; extra_fields_json: string }[]>(
    "select counterparty, extra_fields_json from transactions where is_deleted = 0 and extra_fields_json is not null",
  );

  const groups = new Map<string, { count: number; counterpartyCounts: Map<string, number> }>();
  for (const row of rows) {
    let iban: string | null = null;
    try {
      const extra = JSON.parse(row.extra_fields_json);
      if (extra?.recipient_iban) iban = normalizeIban(String(extra.recipient_iban));
    } catch {
      continue;
    }
    if (!iban || ownIbanSet.has(iban)) continue;
    const group = groups.get(iban) ?? { count: 0, counterpartyCounts: new Map<string, number>() };
    group.count += 1;
    group.counterpartyCounts.set(row.counterparty, (group.counterpartyCounts.get(row.counterparty) ?? 0) + 1);
    groups.set(iban, group);
  }

  const qualifying: IbanGroup[] = [];
  for (const [iban, group] of groups) {
    if (group.count < MIN_OCCURRENCES) continue;
    const sampleCounterparty = [...group.counterpartyCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    qualifying.push({ iban, count: group.count, sampleCounterparty });
  }
  if (qualifying.length === 0) return;

  const persons = await db.select<{ id: number; name: string }[]>("select id, name from persons where is_active = 1");
  const aliases = await db.select<{ person_id: number; alias: string; person_name: string }[]>(
    `select pa.person_id, pa.alias, p.name as person_name from person_aliases pa join persons p on p.id = pa.person_id`,
  );
  const nameCandidates = [
    ...persons.map((p) => ({ alias: p.name, person_name: p.name })),
    ...aliases,
  ];

  for (const g of qualifying) {
    const normCounterparty = normalizeCounterparty(g.sampleCounterparty);
    const personMatch = nameCandidates.find((c) => {
      const normAlias = normalizeCounterparty(c.alias);
      return !!normAlias && (normCounterparty === normAlias || normCounterparty.includes(normAlias) || normAlias.includes(normCounterparty));
    });

    const message = personMatch
      ? `Diese IBAN taucht in ${g.count} Buchungen von "${personMatch.person_name}" auf – gehört sie zu einem deiner Konten?`
      : `Diese IBAN taucht in ${g.count} Buchungen auf – gehört sie zu einem deiner Konten?`;

    await createOrUpdateNotification({
      type: "own_account_suggestion",
      ref_table: `own_account_iban:${g.iban}`,
      ref_id: 0,
      message,
      priority: "info",
    });
  }
}
