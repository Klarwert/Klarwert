import { getDb } from "@/db/client";
import { todayIso } from "@/lib/dates";
import type { AssetWithOwners } from "@/db/repositories/assets";

interface AnchorInfo {
  id: number;
  value: number;
  date: string;
}

interface TxLite {
  asset_id: number;
  booking_date: string;
  amount_cents: number;
}

interface ValueHistoryLite {
  asset_id: number;
  valued_at: string;
  value_cents: number;
}

/**
 * Ein Konto kann mehrere 'anchor'-Einträge haben: den Erstimport-Anker plus spätere
 * Saldo-Korrekturen (siehe UpdateValueModal) – jede Korrektur setzt einen neuen Anker,
 * der ab ihrem Datum den vorherigen ablöst. Darum je Asset eine (nach Datum/Id) sortierte
 * Liste statt eines einzelnen Werts.
 */
async function fetchAnchors(): Promise<Map<number, AnchorInfo[]>> {
  const db = await getDb();
  const rows = await db.select<{ id: number; asset_id: number; valued_at: string; value_cents: number }[]>(
    "select id, asset_id, valued_at, value_cents from value_history where source = 'anchor' order by valued_at asc, id asc",
  );
  const map = new Map<number, AnchorInfo[]>();
  for (const r of rows) {
    const list = map.get(r.asset_id) ?? [];
    list.push({ id: r.id, value: r.value_cents, date: r.valued_at });
    map.set(r.asset_id, list);
  }
  return map;
}

/** Der zum Stichtag gültige Anker: der letzte Anker mit Datum <= cutoff. */
function anchorAt(anchorList: AnchorInfo[], cutoff: string): AnchorInfo | undefined {
  let result: AnchorInfo | undefined;
  for (const a of anchorList) {
    if (a.date > cutoff) break;
    result = a;
  }
  return result;
}

async function fetchTransactionsLite(): Promise<TxLite[]> {
  const db = await getDb();
  return db.select<TxLite[]>(
    "select asset_id, booking_date, amount_cents from transactions where is_deleted = 0",
  );
}

async function fetchValuableHistory(): Promise<Map<number, ValueHistoryLite[]>> {
  const db = await getDb();
  const rows = await db.select<ValueHistoryLite[]>(
    "select asset_id, valued_at, value_cents from value_history order by valued_at asc, id asc",
  );
  const map = new Map<number, ValueHistoryLite[]>();
  for (const r of rows) {
    const list = map.get(r.asset_id) ?? [];
    list.push(r);
    map.set(r.asset_id, list);
  }
  return map;
}

function accountBalanceAt(
  assetId: number,
  cutoff: string,
  anchors: Map<number, AnchorInfo[]>,
  txByAsset: Map<number, TxLite[]>,
): number {
  const anchor = anchorAt(anchors.get(assetId) ?? [], cutoff);
  const anchorValue = anchor?.value ?? 0;
  const anchorDate = anchor?.date ?? "0000-01-01";
  const txs = txByAsset.get(assetId) ?? [];
  let sum = 0;
  for (const tx of txs) {
    if (tx.booking_date > anchorDate && tx.booking_date <= cutoff) {
      sum += tx.amount_cents;
    }
  }
  return anchorValue + sum;
}

function valuableValueAt(
  assetId: number,
  cutoff: string,
  historyByAsset: Map<number, ValueHistoryLite[]>,
): number {
  const history = historyByAsset.get(assetId) ?? [];
  let value = 0;
  for (const entry of history) {
    if (entry.valued_at <= cutoff) value = entry.value_cents;
    else break;
  }
  return value;
}

function groupByAsset(txs: TxLite[]): Map<number, TxLite[]> {
  const map = new Map<number, TxLite[]>();
  for (const tx of txs) {
    const list = map.get(tx.asset_id) ?? [];
    list.push(tx);
    map.set(tx.asset_id, list);
  }
  return map;
}

/** Aktueller Kontostand/Wertstand je Asset (Anker + Transaktionen bzw. letzter Wertehistorie-Eintrag). */
export async function getCurrentBalances(
  assets: AssetWithOwners[],
): Promise<Map<number, number>> {
  const [anchors, txs, valuableHistory] = await Promise.all([
    fetchAnchors(),
    fetchTransactionsLite(),
    fetchValuableHistory(),
  ]);
  const txByAsset = groupByAsset(txs);
  const today = todayIso();
  const result = new Map<number, number>();
  for (const asset of assets) {
    if (asset.kind === "account") {
      result.set(asset.id, accountBalanceAt(asset.id, today, anchors, txByAsset));
    } else {
      result.set(asset.id, valuableValueAt(asset.id, today, valuableHistory));
    }
  }
  return result;
}

export interface NetWorthPoint {
  period: string;
  cents: number;
}

/** Netto-Vermögen über die letzten `months` Monatsenden (letzter Punkt = heute). */
export async function getNetWorthSeries(
  assets: AssetWithOwners[],
  months = 12,
): Promise<NetWorthPoint[]> {
  const [anchors, txs, valuableHistory] = await Promise.all([
    fetchAnchors(),
    fetchTransactionsLite(),
    fetchValuableHistory(),
  ]);
  const txByAsset = groupByAsset(txs);

  const cutoffs: { label: string; date: string }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    if (i === 0) {
      cutoffs.push({ label: todayIso(), date: todayIso() });
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const iso = d.toISOString().slice(0, 10);
      cutoffs.push({ label: iso, date: iso });
    }
  }

  return cutoffs.map(({ label, date }) => {
    let total = 0;
    for (const asset of assets) {
      total +=
        asset.kind === "account"
          ? accountBalanceAt(asset.id, date, anchors, txByAsset)
          : valuableValueAt(asset.id, date, valuableHistory);
    }
    return { period: label, cents: total };
  });
}

export async function getAssetIdsWithAnchor(): Promise<Set<number>> {
  const anchors = await fetchAnchors();
  return new Set(anchors.keys());
}

/** Sparkline-Punkte (kumulierter Kontostand) für ein einzelnes Konto, jüngste zuerst abgeschnitten. */
export async function getAccountSparkline(assetId: number, maxPoints = 15): Promise<number[]> {
  const db = await getDb();
  const anchors = await db.select<{ valued_at: string; value_cents: number }[]>(
    "select valued_at, value_cents from value_history where asset_id = $1 and source = 'anchor' order by valued_at asc, id asc",
    [assetId],
  );
  const txs = await db.select<{ booking_date: string; amount_cents: number }[]>(
    "select booking_date, amount_cents from transactions where asset_id = $1 and is_deleted = 0 order by booking_date asc, id asc",
    [assetId],
  );

  type Event = { date: string; order: number; apply: (running: number) => number; isTx: boolean };
  const events: Event[] = [
    ...anchors.map((a) => ({ date: a.valued_at, order: 0, apply: () => a.value_cents, isTx: false })),
    ...txs.map((t) => ({ date: t.booking_date, order: 1, apply: (running: number) => running + t.amount_cents, isTx: true })),
  ];
  events.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));

  const points: number[] = [];
  let running = 0;
  for (const event of events) {
    running = event.apply(running);
    if (event.isTx) points.push(running);
  }
  if (points.length === 0) return [];
  return points.slice(-maxPoints);
}
