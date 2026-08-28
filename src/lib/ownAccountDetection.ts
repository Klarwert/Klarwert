import type Database from "@tauri-apps/plugin-sql";
import { normalizeCounterparty } from "@/lib/merchant-match";
import { createOrUpdateNotification } from "@/db/repositories/notifications";

const MIN_OCCURRENCES = 5;

/** Normalisiert einen Kontoidentifikator: Leerzeichen entfernen, Großschreibung. */
export function normalizeAccountIdentifier(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/** @deprecated Verwende normalizeAccountIdentifier */
export const normalizeIban = normalizeAccountIdentifier;

interface AccountGroup {
  identifier: string;
  count: number;
  sampleCounterparty: string;
}

/**
 * Heuristik „Eigene Konten automatisch vorschlagen" (Bugfix-Runde 3, Punkt 4): taucht derselbe
 * Empfänger-Kontoidentifikator, der noch keinem eigenen Konto zugeordnet ist, wiederholt auf
 * (>= 5 Buchungen), wird ein dismissable Hinweis erzeugt – nie automatisch ein Konto angelegt,
 * nur vorgeschlagen.
 *
 * Liest jetzt aus `assets.account_identifier` (generalisiert seit Migration 025); fällt für
 * bestehende Daten auf `assets.iban` zurück.
 */
export async function detectOwnAccountSuggestions(db: Database): Promise<void> {
  // account_identifier (neu) hat Vorrang; iban (legacy) als Fallback
  const ownAccounts = await db.select<{ account_identifier: string | null; iban: string | null }[]>(
    "select account_identifier, iban from assets where is_deleted = 0 and (account_identifier is not null or iban is not null)",
  );
  const ownIdentifierSet = new Set(
    ownAccounts
      .map((r) => r.account_identifier ?? r.iban ?? "")
      .filter(Boolean)
      .map(normalizeAccountIdentifier),
  );

  const rows = await db.select<{ counterparty: string; extra_fields_json: string }[]>(
    "select counterparty, extra_fields_json from transactions where is_deleted = 0 and extra_fields_json is not null",
  );

  const groups = new Map<string, { count: number; counterpartyCounts: Map<string, number> }>();
  for (const row of rows) {
    let identifier: string | null = null;
    try {
      const extra = JSON.parse(row.extra_fields_json);
      // Unterstützt sowohl IBAN-basierte (de) als auch andere Identifikatortypen
      if (extra?.recipient_iban) identifier = normalizeAccountIdentifier(String(extra.recipient_iban));
      else if (extra?.recipient_account_identifier) identifier = normalizeAccountIdentifier(String(extra.recipient_account_identifier));
    } catch {
      continue;
    }
    if (!identifier || ownIdentifierSet.has(identifier)) continue;
    const group = groups.get(identifier) ?? { count: 0, counterpartyCounts: new Map<string, number>() };
    group.count += 1;
    group.counterpartyCounts.set(row.counterparty, (group.counterpartyCounts.get(row.counterparty) ?? 0) + 1);
    groups.set(identifier, group);
  }

  const qualifying: AccountGroup[] = [];
  for (const [identifier, group] of groups) {
    if (group.count < MIN_OCCURRENCES) continue;
    const sampleCounterparty = [...group.counterpartyCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    qualifying.push({ identifier, count: group.count, sampleCounterparty });
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
      ? `Dieser Kontoidentifikator taucht in ${g.count} Buchungen von "${personMatch.person_name}" auf – gehört er zu einem deiner Konten?`
      : `Dieser Kontoidentifikator taucht in ${g.count} Buchungen auf – gehört er zu einem deiner Konten?`;

    await createOrUpdateNotification({
      type: "own_account_suggestion",
      ref_table: `own_account_iban:${g.identifier}`,
      ref_id: 0,
      message,
      priority: "info",
    });
  }
}
