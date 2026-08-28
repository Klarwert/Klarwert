import { isNumericAmount, isParsableDate } from "@/lib/import/detect";
import type { ColumnRole } from "@/lib/import/bankProfiles";

/** Auto-Raten der Spaltenrollen, wenn kein Bankprofil-Fingerprint matcht. */
export function guessColumnRoles(
  headers: string[],
  rows: string[][],
): Partial<Record<ColumnRole, number>> {
  const colCount = headers.length;
  const roles: Partial<Record<ColumnRole, number>> = {};
  const used = new Set<number>();

  let bestDateCol = -1;
  let bestDateScore = 0;
  for (let c = 0; c < colCount; c += 1) {
    const score = rows.filter((r) => isParsableDate(r[c])).length;
    if (score > bestDateScore) {
      bestDateScore = score;
      bestDateCol = c;
    }
  }
  if (bestDateCol >= 0 && bestDateScore / Math.max(rows.length, 1) > 0.5) {
    roles.date = bestDateCol;
    used.add(bestDateCol);
  }

  let bestAmountCol = -1;
  let bestAmountScore = 0;
  for (let c = 0; c < colCount; c += 1) {
    if (used.has(c)) continue;
    const score = rows.filter((r) => isNumericAmount(r[c])).length;
    if (score > bestAmountScore) {
      bestAmountScore = score;
      bestAmountCol = c;
    }
  }
  if (bestAmountCol >= 0 && bestAmountScore / Math.max(rows.length, 1) > 0.5) {
    roles.amount = bestAmountCol;
    used.add(bestAmountCol);
  }

  const textCols: { col: number; avgLen: number }[] = [];
  for (let c = 0; c < colCount; c += 1) {
    if (used.has(c)) continue;
    const lengths = rows.map((r) => (r[c] ?? "").length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1);
    textCols.push({ col: c, avgLen });
  }
  textCols.sort((a, b) => b.avgLen - a.avgLen);
  if (textCols[0]) {
    roles.purpose = textCols[0].col;
    used.add(textCols[0].col);
  }
  if (textCols[1]) {
    roles.counterparty = textCols[1].col;
    used.add(textCols[1].col);
  }

  for (let c = 0; c < colCount; c += 1) {
    if (used.has(c)) continue;
    const values = rows.map((r) => r[c]).filter((v) => v && v.trim() !== "");
    if (values.length === 0) continue;
    const uniqueCount = new Set(values).size;
    if (uniqueCount === values.length && values.length === rows.length) {
      roles.external_id = c;
      break;
    }
  }

  return roles;
}
