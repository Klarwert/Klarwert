export const DATE_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /^\d{4}-\d{2}-\d{2}$/, label: "yyyy-MM-dd" },
  { regex: /^\d{2}\.\d{2}\.\d{4}$/, label: "dd.MM.yyyy" },
  { regex: /^\d{2}\.\d{2}\.\d{2}$/, label: "dd.MM.yy" },
];

export function isParsableDate(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return DATE_PATTERNS.some((p) => p.regex.test(v));
}

const DE_AMOUNT = /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/;
const EN_AMOUNT = /^-?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^-?\d+(\.\d{1,2})?$/;

export function isNumericAmount(value: string | undefined): boolean {
  const v = (value ?? "").trim().replace(/^\+/, "").replace(/\s*€?$/, "");
  return DE_AMOUNT.test(v) || EN_AMOUNT.test(v);
}

export function detectDateFormat(rows: string[][]): string | null {
  const columnCount = rows[0]?.length ?? 0;
  let best: { label: string; score: number } | null = null;
  for (let col = 0; col < columnCount; col += 1) {
    for (const pattern of DATE_PATTERNS) {
      const score = rows.filter((r) => pattern.regex.test((r[col] ?? "").trim())).length;
      if (score > 0 && (!best || score > best.score)) best = { label: pattern.label, score };
    }
  }
  if (best && best.score / Math.max(rows.length, 1) > 0.5) return best.label;
  return null;
}

export function detectDecimalFormat(rows: string[][]): "de" | "en" {
  let deVotes = 0;
  let enVotes = 0;
  for (const row of rows) {
    for (const cell of row) {
      const v = (cell ?? "").trim();
      if (DE_AMOUNT.test(v)) deVotes += 1;
      else if (EN_AMOUNT.test(v)) enVotes += 1;
    }
  }
  return enVotes > deVotes ? "en" : "de";
}

export function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const counts: Record<string, number> = {
    ";": (headerLine.match(/;/g) ?? []).length,
    ",": (headerLine.match(/,/g) ?? []).length,
    "\t": (headerLine.match(/\t/g) ?? []).length,
  };
  const [delimiter, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (count > 0 ? delimiter : ";") as "," | ";" | "\t";
}

export function detectEncoding(buffer: ArrayBuffer): "utf-8" | "windows-1252" {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}
