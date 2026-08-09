import { getDb } from "@/db/client";
import { listRules, type RuleWithConditions } from "@/db/repositories/rules";
import Database from "@tauri-apps/plugin-sql";


interface PipelineTx {
  id: number;
  asset_id: number;
  booking_date: string;
  counterparty: string;
  purpose: string | null;
  amount_cents: number;
  category_id: number | null;
  categorization_source: string;
  is_transfer: 0 | 1;
  extra_fields_json?: string | null;
}

/** Baut aus einer PipelineTx die für conditionMatches/findMatchingRule benötigte SuggestTx. */
function buildSuggestTx(tx: PipelineTx): SuggestTx {
  let extraFields: Record<string, string> | undefined;
  if (tx.extra_fields_json) {
    try {
      extraFields = JSON.parse(tx.extra_fields_json);
    } catch {
      extraFields = undefined;
    }
  }
  return {
    asset_id: tx.asset_id,
    counterparty: tx.counterparty,
    purpose: tx.purpose,
    amount_cents: tx.amount_cents,
    extraFields,
  };
}

export interface PipelineResult {
  categorized: number;
  transfersFound: number;
}

let kontentransferCategoryIdCache: number | null = null;

async function getKontentransferCategoryId(db: Database): Promise<number | null> {
  if (kontentransferCategoryIdCache !== null) return kontentransferCategoryIdCache;
  const rows = await db.select<{ id: number }[]>(
    `select id from categories where name = 'Kontentransfer' and parent_id in
       (select id from categories where name = 'Bank und Kredit') limit 1`,
  );
  kontentransferCategoryIdCache = rows[0]?.id ?? null;
  return kontentransferCategoryIdCache;
}

import { normalize, findMatchingRule, evaluateConditionGroups, type SuggestTx } from "./pipeline/suggest-category";
import {
  normalizeCounterparty,
  extractMerchantFromPaymentProvider,
  calculateSimilarity,
} from "./merchant-match";
import { logCategorization } from "@/db/repositories/merchants";
import { createOrUpdateNotification } from "@/db/repositories/notifications";

interface MerchantMatchResult {
  merchant_id: number;
  category_id: number | null;
  matched_by: "merchant_iban" | "merchant_alias";
  confidence: number;
}

interface MerchantMatchWithAlternatives {
  best: MerchantMatchResult;
  alternatives: MerchantMatchResult[];
}

async function findMerchantMatch(tx: PipelineTx, db: Database): Promise<MerchantMatchWithAlternatives | null> {
  let recipientIban: string | null = null;
  if ((tx as any).extra_fields_json) {
    try {
      const extra = JSON.parse((tx as any).extra_fields_json);
      if (extra?.recipient_iban) recipientIban = String(extra.recipient_iban).trim().toLowerCase();
    } catch {}
  }

  const providerExtraction = extractMerchantFromPaymentProvider({
    counterparty: tx.counterparty,
    purpose: tx.purpose,
  });

  const searchCounterparty = providerExtraction.merchantName
    ? normalizeCounterparty(providerExtraction.merchantName)
    : normalizeCounterparty(tx.counterparty);

  if (!searchCounterparty && !recipientIban) return null;

  // 1. IBAN Match
  if (recipientIban) {
    const ibanRows = await db.select<
      { merchant_id: number; default_category_id: number | null }[]
    >(
      `select m.id as merchant_id, m.default_category_id
       from merchant_aliases ma
       join merchants m on m.id = ma.merchant_id
       where ma.match_type = 'iban' and lower(trim(ma.match_value)) = $1
         and m.is_active = 1
         and m.id not in (select merchant_id from merchant_suppressions)
       order by ma.priority asc limit 1`,
      [recipientIban],
    );
    if (ibanRows.length > 0) {
      return {
        best: {
          merchant_id: ibanRows[0].merchant_id,
          category_id: ibanRows[0].default_category_id,
          matched_by: "merchant_iban",
          confidence: 1.0,
        },
        alternatives: [],
      };
    }
  }

  if (!searchCounterparty) return null;

  // Fetch all active aliases for unsuppressed merchants
  const aliases = await db.select<
    {
      merchant_id: number;
      default_category_id: number | null;
      match_type: string;
      match_value: string;
      priority: number;
    }[]
  >(
    `select m.id as merchant_id, m.default_category_id, ma.match_type, ma.match_value, ma.priority
     from merchant_aliases ma
     join merchants m on m.id = ma.merchant_id
     where m.is_active = 1
       and ma.match_type != 'iban'
       and m.id not in (select merchant_id from merchant_suppressions)
     order by ma.priority asc`,
  );

  // 2. Exact Name Match
  const exactMatches: MerchantMatchResult[] = [];
  for (const a of aliases.filter((x) => x.match_type === "name_exact")) {
    if (normalizeCounterparty(a.match_value) === searchCounterparty) {
      exactMatches.push({
        merchant_id: a.merchant_id,
        category_id: a.default_category_id,
        matched_by: "merchant_alias",
        confidence: 0.95,
      });
    }
  }
  if (exactMatches.length > 0) {
    const distinct = dedupeByMerchant(exactMatches);
    return { best: distinct[0], alternatives: distinct.slice(1, 3) };
  }

  // 3. Fuzzy / Substring Match – alle Kandidaten oberhalb einer niedrigen Schwelle sammeln,
  // damit knapp unterlegene Alternativen für die Transparenz-Anzeige verfügbar sind.
  const fuzzyMatches: MerchantMatchResult[] = [];
  for (const a of aliases.filter((x) => x.match_type === "name_fuzzy")) {
    const aliasNorm = normalizeCounterparty(a.match_value);
    const isSubstring = searchCounterparty.includes(aliasNorm) || aliasNorm.includes(searchCounterparty);
    const score = isSubstring ? 0.9 : calculateSimilarity(searchCounterparty, aliasNorm);
    if (score >= 0.6) {
      fuzzyMatches.push({
        merchant_id: a.merchant_id,
        category_id: a.default_category_id,
        matched_by: "merchant_alias",
        confidence: Math.round(score * 100) / 100,
      });
    }
  }
  if (fuzzyMatches.length > 0) {
    const distinct = dedupeByMerchant(fuzzyMatches);
    if (distinct[0].confidence >= 0.8) {
      return { best: distinct[0], alternatives: distinct.slice(1, 3) };
    }
  }

  // 4. Regex Match
  for (const a of aliases.filter((x) => x.match_type === "regex")) {
    try {
      const reg = new RegExp(a.match_value, "i");
      if (reg.test(tx.counterparty) || (tx.purpose && reg.test(tx.purpose))) {
        return {
          best: {
            merchant_id: a.merchant_id,
            category_id: a.default_category_id,
            matched_by: "merchant_alias",
            confidence: 0.85,
          },
          alternatives: [],
        };
      }
    } catch {}
  }

  return null;
}

interface MerchantRuleRow {
  id: number;
  priority: number;
  category_id: number | null;
}

/**
 * Nach einem Alias-Treffer (Ebene A): die verknüpften `rules` dieses Händlers in Prioritätsreihenfolge
 * prüfen, erste treffende gewinnt (siehe klarwert-haendler-regel-konzept-v2.md). Eine Regel ohne
 * Bedingungen gilt als Default-Treffer (deckt den einfachen Fall "ein Alias, eine Kategorie" ab).
 * Hat der Händler keine einzige verknüpfte Regel (z. B. noch nicht migrierter/älterer Datensatz),
 * fällt die Funktion auf `fallbackCategoryId` (merchants.default_category_id) zurück.
 */
async function resolveMerchantCategory(
  merchantId: number,
  tx: PipelineTx,
  db: Database,
  fallbackCategoryId: number | null,
): Promise<{ categoryId: number | null; ruleId: number | null }> {
  const rules = await db.select<MerchantRuleRow[]>(
    "select id, priority, category_id from rules where merchant_id = $1 and is_deleted = 0 order by priority asc",
    [merchantId],
  );
  if (rules.length === 0) return { categoryId: fallbackCategoryId, ruleId: null };

  const suggestTx = buildSuggestTx(tx);
  for (const rule of rules) {
    const groupRows = await db.select<{ id: number }[]>(
      "select id from rule_condition_groups where rule_id = $1 order by group_order asc",
      [rule.id],
    );
    const groups = await Promise.all(
      groupRows.map(async (g) => ({
        conditions: await db.select<import("@/db/types").RuleCondition[]>(
          "select * from rule_conditions where group_id = $1",
          [g.id],
        ),
      })),
    );
    if (evaluateConditionGroups(groups, suggestTx)) {
      return { categoryId: rule.category_id ?? fallbackCategoryId, ruleId: rule.id };
    }
  }
  return { categoryId: fallbackCategoryId, ruleId: null };
}

/** Dedupliziert Kandidaten nach Händler (höchste Confidence gewinnt), absteigend sortiert. */
function dedupeByMerchant(candidates: MerchantMatchResult[]): MerchantMatchResult[] {
  const byMerchant = new Map<number, MerchantMatchResult>();
  for (const c of candidates) {
    const existing = byMerchant.get(c.merchant_id);
    if (!existing || c.confidence > existing.confidence) byMerchant.set(c.merchant_id, c);
  }
  return [...byMerchant.values()].sort((a, b) => b.confidence - a.confidence);
}

async function findSimilarityMatch(
  tx: PipelineTx,
  db: Database,
): Promise<{ category_id: number; confidence: number; alternatives: { category_id: number; confidence: number }[] } | null> {
  const normTarget = normalizeCounterparty(tx.counterparty);
  if (!normTarget) return null;

  const manualTxs = await db.select<{ counterparty: string; category_id: number }[]>(
    `select counterparty, category_id from transactions
     where is_deleted = 0 and categorization_source = 'manual' and category_id is not null`,
  );

  // Pro Kategorie nur die höchste Confidence behalten, dann absteigend sortieren – so lassen
  // sich neben dem Treffer auch knapp unterlegene Alternativen für die Debug-Anzeige ermitteln.
  const byCategory = new Map<number, number>();
  for (const m of manualTxs) {
    const normCand = normalizeCounterparty(m.counterparty);
    const score = calculateSimilarity(normTarget, normCand);
    if (score < 0.6) continue;
    const existing = byCategory.get(m.category_id);
    if (existing === undefined || score > existing) byCategory.set(m.category_id, score);
  }

  const sorted = [...byCategory.entries()]
    .map(([category_id, confidence]) => ({ category_id, confidence: Math.round(confidence * 100) / 100 }))
    .sort((a, b) => b.confidence - a.confidence);

  if (sorted.length === 0 || sorted[0].confidence < 0.85) return null;

  return { category_id: sorted[0].category_id, confidence: sorted[0].confidence, alternatives: sorted.slice(1, 3) };
}

async function findMatchingContract(tx: PipelineTx, db: Database): Promise<{ id: number; category_id: number | null } | null> {
  const contracts = await db.select<
    { id: number; name: string; current_amount_cents: number; category_id: number | null }[]
  >(
    "select id, name, current_amount_cents, category_id from contracts where is_deleted = 0 and current_amount_cents != 0 and status in ('confirmed', 'price_changed')",
  );
  for (const c of contracts) {
    const nameNormalized = normalize(c.name);
    const counterpartyNormalized = normalize(tx.counterparty);
    const namesMatch =
      counterpartyNormalized.includes(nameNormalized) || nameNormalized.includes(counterpartyNormalized);
    const amountMatches = Math.abs(tx.amount_cents - c.current_amount_cents) <= Math.abs(c.current_amount_cents) * 0.05;
    if (namesMatch && amountMatches) return { id: c.id, category_id: c.category_id };
  }
  return null;
}

async function findTransferPartner(tx: PipelineTx, db: Database): Promise<PipelineTx | null> {
  const dismissed = await db.select<{ asset_id_a: number; asset_id_b: number; amount_cents: number }[]>(
    "select asset_id_a, asset_id_b, amount_cents from dismissed_transfer_patterns",
  );
  const isDismissed = (otherAssetId: number, amount: number) =>
    dismissed.some(
      (d: any) =>
        Math.abs(d.amount_cents) === Math.abs(amount) &&
        ((d.asset_id_a === tx.asset_id && d.asset_id_b === otherAssetId) ||
          (d.asset_id_b === tx.asset_id && d.asset_id_a === otherAssetId)),
    );

  const candidates = await db.select<PipelineTx[]>(
    `select id, asset_id, booking_date, counterparty, purpose, amount_cents, category_id, categorization_source, is_transfer
     from transactions
     where is_deleted = 0 and asset_id != $1 and is_transfer = 0
       and amount_cents = $2
       and julianday(booking_date) between julianday($3) - 2 and julianday($3) + 2`,
    [tx.asset_id, -tx.amount_cents, tx.booking_date],
  );
  return candidates.find((c: any) => !isDismissed(c.asset_id, c.amount_cents)) ?? null;
}

function extractCounterpartyIban(tx: PipelineTx): string | null {
  if (!(tx as any).extra_fields_json) return null;
  try {
    const extra = JSON.parse((tx as any).extra_fields_json);
    if (!extra?.recipient_iban) return null;
    return String(extra.recipient_iban).trim().toUpperCase().replace(/\s+/g, "");
  } catch {
    return null;
  }
}

/**
 * Stufe 1 (höchste Konfidenz): Gegenpartei-IBAN gegen assets.iban aller eigenen Konten. Funktioniert
 * auch OHNE Gegenbuchung (z. B. Depot ohne CSV-Export) und ignoriert dismissed_transfer_patterns
 * bewusst – ein IBAN-Treffer ist ein stärkeres Signal als das unterdrückte Betragsmuster.
 */
async function findTransferPartnerByIban(tx: PipelineTx, db: Database): Promise<{ assetId: number } | null> {
  const counterpartyIban = extractCounterpartyIban(tx);
  if (!counterpartyIban) return null;
  const rows = await db.select<{ id: number }[]>(
    "select id from assets where is_deleted = 0 and iban is not null and upper(replace(iban, ' ', '')) = $1 and id != $2",
    [counterpartyIban, tx.asset_id],
  );
  return rows[0] ? { assetId: rows[0].id } : null;
}

/**
 * Stufe 3 (niedrigste Konfidenz, nur Hinweis): normalisierter Empfängername gegen person_aliases
 * UND den eigentlichen Personennamen selbst (persons.name) – eine Person ist damit sofort nutzbar,
 * auch bevor eine zusätzliche Namensvariante hinterlegt wurde. Case-insensitiv über
 * normalizeCounterparty (lowercased). Erzeugt bewusst KEINE automatische Transfer-Markierung
 * (Namensgleichheit allein ist zu unsicher), sondern nur eine Benachrichtigung mit dem Hinweis,
 * die IBAN zu ergänzen.
 */
async function findTransferPartnerByName(
  tx: PipelineTx,
  db: Database,
): Promise<{ personId: number; personName: string } | null> {
  const normCounterparty = normalizeCounterparty(tx.counterparty);
  if (!normCounterparty) return null;
  const persons = await db.select<{ id: number; name: string }[]>("select id, name from persons where is_active = 1");
  const aliases = await db.select<{ person_id: number; alias: string; person_name: string }[]>(
    `select pa.person_id, pa.alias, p.name as person_name
     from person_aliases pa join persons p on p.id = pa.person_id`,
  );
  const candidates = [
    ...persons.map((p) => ({ person_id: p.id, alias: p.name, person_name: p.name })),
    ...aliases,
  ];
  for (const a of candidates) {
    const normAlias = normalizeCounterparty(a.alias);
    if (!normAlias) continue;
    if (normCounterparty === normAlias || normCounterparty.includes(normAlias) || normAlias.includes(normCounterparty)) {
      return { personId: a.person_id, personName: a.person_name };
    }
  }
  return null;
}

/** Wendet Transfer+Sparen-Markierung auf EINE Transaktion an (Stufe 1 – Gegenbuchung ggf. nicht vorhanden). */
async function applySingleSidedTransfer(
  tx: PipelineTx,
  destinationAssetId: number,
  categoryId: number | null,
  db: Database,
): Promise<void> {
  await db.execute(
    "update transactions set is_transfer = 1, transfer_status = 'confirmed', category_id = coalesce(category_id, $1) where id = $2",
    [categoryId, tx.id],
  );
  // Bewusst KEIN Vorzeichen-Filter mehr hier: destinationAssetId ist per IBAN-Match immer das gleiche
  // eigene Konto, unabhängig von der Buchungsrichtung. Eine Einzahlung (tx negativ) UND eine Entnahme
  // (tx positiv, Geld kommt von diesem Konto zurück) müssen beide erfasst werden – sonst verringert
  // eine Entnahme vom Sparkonto den ausgewiesenen Sparstand nie (siehe Bugfix-Runde 3, Punkt 4:
  // getCumulativeSaving() summiert -amount_cents, das Vorzeichen der markierten Zeile allein
  // entscheidet, ob es sich um Zu- oder Abgang handelt).
  const destination = await db.select<{ account_type: string | null; default_sparzweck_id: number | null }[]>(
    "select account_type, default_sparzweck_id from assets where id = $1",
    [destinationAssetId],
  );
  const dest = destination[0];
  if (dest && (dest.account_type === "tagesgeld" || dest.account_type === "depot")) {
    await db.execute("update transactions set is_saving = 1, sparzweck_id = coalesce(sparzweck_id, $1) where id = $2", [
      dest.default_sparzweck_id,
      tx.id,
    ]);
  }
}

async function applyTransferPair(txA: PipelineTx, txB: PipelineTx, categoryId: number | null, db: Database): Promise<void> {
  await db.execute(
    "update transactions set is_transfer = 1, transfer_pair_id = $1, transfer_status = 'suggested', category_id = coalesce(category_id, $2) where id = $3",
    [txB.id, categoryId, txA.id],
  );
  await db.execute(
    "update transactions set is_transfer = 1, transfer_pair_id = $1, transfer_status = 'suggested', category_id = coalesce(category_id, $2) where id = $3",
    [txA.id, categoryId, txB.id],
  );

  const [assetA, assetB] = await db.select<{ id: number; account_type: string | null; default_sparzweck_id: number | null }[]>(
    "select id, account_type, default_sparzweck_id from assets where id in ($1, $2)",
    [txA.asset_id, txB.asset_id],
  );
  const isSavingType = (accountType: string | null) => accountType === "tagesgeld" || accountType === "depot";
  const assetByAssetId = (assetId: number) => (assetA?.id === assetId ? assetA : assetB?.id === assetId ? assetB : undefined);
  const assetTxA = assetByAssetId(txA.asset_id);
  const assetTxB = assetByAssetId(txB.asset_id);

  // Wichtig: die Sparen-Markierung (is_saving/sparzweck_id) läuft immer auf der NICHT-Spar-Seite des
  // Paares (typischerweise das Girokonto) – ihr Vorzeichen encodiert bereits korrekt Zu- (negativ,
  // Geld verlässt das Girokonto) vs. Abgang (positiv, Geld kommt vom Sparkonto zurück). Die Spar-Seite
  // selbst bekommt keine Sparzweck-Zuordnung (sonst würde getCumulativeSaving beide Seiten zählen).
  let savingLeg: PipelineTx | null = null;
  let savingAsset: { default_sparzweck_id: number | null } | undefined;
  if (isSavingType(assetTxA?.account_type ?? null) && !isSavingType(assetTxB?.account_type ?? null)) {
    savingLeg = txB;
    savingAsset = assetTxA;
  } else if (isSavingType(assetTxB?.account_type ?? null) && !isSavingType(assetTxA?.account_type ?? null)) {
    savingLeg = txA;
    savingAsset = assetTxB;
  }
  if (savingLeg && savingAsset) {
    await db.execute("update transactions set is_saving = 1, sparzweck_id = coalesce(sparzweck_id, $1) where id = $2", [
      savingAsset.default_sparzweck_id,
      savingLeg.id,
    ]);
  }
}

async function applyRule(tx: PipelineTx, rule: RuleWithConditions, db: Database): Promise<boolean> {
  const categoryId = rule.category_id ?? tx.category_id;
  await db.execute(
    `update transactions set
       category_id = coalesce($1, category_id),
       categorization_source = case when $1 is not null then 'rule' else categorization_source end,
       applied_rule_id = $2,
       is_transfer = case when $3 = 1 then 1 else is_transfer end,
       is_saving = case when $4 = 1 then 1 else is_saving end,
       sparzweck_id = coalesce($5, sparzweck_id)
     where id = $6`,
    [categoryId, rule.id, rule.mark_as_transfer, rule.mark_as_saving, rule.sparzweck_id, tx.id],
  );
  if (rule.tag_id) {
    await db.execute(
      "insert or ignore into transaction_tags (transaction_id, tag_id) values ($1, $2)",
      [tx.id, rule.tag_id],
    );
  }
  return !!rule.category_id;
}

/**
 * Kategorisierungs-Pipeline (Product Spec Kap. 3):
 * 1. Manuell > 2. Vertrag > 3. Transfer > 4. Benutzerregeln > 5. Händler-DB > 6. Ähnlichkeit
 * > 7. Unkategorisiert.
 * Läuft nach jedem Import sowie bei manueller Transaktionsanlage. Überschreibt nie manuelle Zuweisungen.
 *
 * Die frühere separate "Regel-Vorlagen"-Stufe (Text-Suchbegriff -> Kategorie) ist entfallen und in
 * die Händler-Erkennung aufgegangen – jede Vorlage ist jetzt ein Händler mit einer verknüpften
 * `rules`-Zeile (siehe klarwert-haendler-regel-konzept-v2.md, migrateRuleTemplatesToMerchants()).
 *
 * @param transactionIds  IDs der zu bewertenden Transaktionen.
 * @param dbOrNull        Optionale offene DB-Connection (z. B. aus Import-Transaktion).
 *                        Wenn übergeben, wird diese verwendet – kein eigenes BEGIN/COMMIT!
 */
export async function runPipelineForTransactions(
  transactionIds: number[],
  dbOrNull?: Database,
): Promise<PipelineResult> {
  if (transactionIds.length === 0) return { categorized: 0, transfersFound: 0 };
  const db = dbOrNull ?? (await getDb());
  const rules = await listRules();
  const kontentransferCategoryId = await getKontentransferCategoryId(db);

  let categorized = 0;
  let transfersFound = 0;

  for (const id of transactionIds) {
    const rows = await db.select<PipelineTx[]>(
      `select id, asset_id, booking_date, counterparty, purpose, amount_cents, category_id, categorization_source, is_transfer, extra_fields_json
       from transactions where id = $1 and is_deleted = 0`,
      [id],
    );
    const tx = rows[0];
    if (!tx || tx.categorization_source === "manual") continue;

    // 1. Vertrag
    const contractMatch = await findMatchingContract(tx, db);
    if (contractMatch) {
      await db.execute(
        "update transactions set contract_id = $1, category_id = coalesce(category_id, $2), categorization_source = 'contract' where id = $3",
        [contractMatch.id, contractMatch.category_id, id],
      );
      await logCategorization({
        transaction_id: id,
        matched_by: "contract",
        confidence: 1.0,
      }, db);
      categorized += 1;
      continue;
    }

    // 2. Transfer-Erkennung – drei gestaffelte Signale (Stufe 1 IBAN > Stufe 2 Gegenbuchung > Stufe 3 Namenshinweis)
    if (!tx.is_transfer) {
      const ibanMatch = await findTransferPartnerByIban(tx, db);
      if (ibanMatch) {
        await applySingleSidedTransfer(tx, ibanMatch.assetId, kontentransferCategoryId, db);
        await logCategorization({
          transaction_id: id,
          matched_by: "transfer",
          confidence: 1.0,
        }, db);
        transfersFound += 1;
        continue;
      }

      const partner = await findTransferPartner(tx, db);
      if (partner) {
        await applyTransferPair(tx, partner, kontentransferCategoryId, db);
        await logCategorization({
          transaction_id: id,
          matched_by: "transfer",
          confidence: 0.9,
        }, db);
        transfersFound += 1;
        continue;
      }

      const nameHint = await findTransferPartnerByName(tx, db);
      if (nameHint) {
        // Eigener ref_table-Namensraum (nicht "transactions"): die Auto-Archiv-Logik in
        // notifications.ts verwaltet transfer_detected sonst nur für is_transfer=1/'suggested'-Zeilen
        // (Stufe 2) – ein Namenshinweis (Stufe 3, keine automatische Markierung) soll davon unberührt
        // bleiben und nicht bei jedem Pipeline-Lauf verschwinden/neu erscheinen.
        await createOrUpdateNotification({
          type: "transfer_detected",
          ref_table: "transfer_name_hint",
          ref_id: id,
          message: `Möglicher Transfer an ${nameHint.personName} – IBAN des Zielkontos ergänzen für sichere Erkennung?`,
          priority: "info",
        });
      }
    }

    // 3. Benutzerregeln
    const rule = findMatchingRule(rules, buildSuggestTx(tx));
    if (rule) {
      const didCategorize = await applyRule(tx, rule, db);
      if (didCategorize) {
        await logCategorization({
          transaction_id: id,
          matched_by: "user_rule",
          rule_id: rule.id,
          confidence: 1.0,
        }, db);
        categorized += 1;
      }
      continue;
    }

    // 5. Händler-DB (Ebene A) – inkl. der zum Händler verknüpften Regeln (siehe resolveMerchantCategory)
    const merchantMatch = await findMerchantMatch(tx, db);
    if (merchantMatch) {
      const { best, alternatives } = merchantMatch;
      const resolved = await resolveMerchantCategory(best.merchant_id, tx, db, best.category_id);
      await db.execute(
        `update transactions set
           merchant_id = $1,
           category_id = coalesce($2, category_id),
           categorization_source = 'merchant',
           categorization_confidence = $3,
           applied_rule_id = coalesce($4, applied_rule_id)
         where id = $5`,
        [best.merchant_id, resolved.categoryId, best.confidence, resolved.ruleId, id],
      );
      await logCategorization({
        transaction_id: id,
        matched_by: best.matched_by,
        merchant_id: best.merchant_id,
        rule_id: resolved.ruleId,
        confidence: best.confidence,
        alternatives: alternatives.map((a) => ({
          matched_by: a.matched_by,
          merchant_id: a.merchant_id,
          category_id: a.category_id,
          confidence: a.confidence,
        })),
      }, db);
      if (best.category_id !== null) categorized += 1;
      continue;
    }

    // 6. Ähnlichkeits-Fallback (Ebene A Ähnlichkeit)
    const similarityMatch = await findSimilarityMatch(tx, db);
    if (similarityMatch) {
      await db.execute(
        `update transactions set
           category_id = $1,
           categorization_source = 'similarity',
           categorization_confidence = $2,
           is_reviewed = 0
         where id = $3`,
        [similarityMatch.category_id, similarityMatch.confidence, id],
      );
      await logCategorization({
        transaction_id: id,
        matched_by: "similarity",
        confidence: similarityMatch.confidence,
        alternatives: similarityMatch.alternatives.map((a) => ({
          matched_by: "similarity" as const,
          category_id: a.category_id,
          confidence: a.confidence,
        })),
      }, db);
      categorized += 1;
      continue;
    }
  }

  return { categorized, transfersFound };
}

/**
 * Bewertet alle Transaktionen mit categorization_source IN ('none', 'rule') neu.
 * Wird nach jeder Regel-Änderung (Anlegen/Bearbeiten/Löschen/Umsortieren) aufgerufen.
 */
export async function reevaluateAllRuleBasedTransactions(): Promise<PipelineResult> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    "select id from transactions where is_deleted = 0 and categorization_source in ('none', 'rule')",
  );
  const ids = rows.map((r) => r.id);
  return runPipelineForTransactions(ids);
}
