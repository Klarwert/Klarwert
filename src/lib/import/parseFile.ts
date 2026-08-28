import Papa from "papaparse";
import {
  detectDateFormat,
  detectDecimalFormat,
  detectDelimiter,
  detectEncoding,
  isNumericAmount,
  isParsableDate,
} from "@/lib/import/detect";
import { parseAmountWithFormat } from "@/lib/money";
import { parseGermanDateToIso } from "@/lib/dates";

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  detected: {
    encoding: string;
    delimiter: "," | ";" | "\t" | null;
    decimalFormat: "de" | "en";
    dateFormat: string;
  };
}

export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

/** CSV-/Excel-Zellwert (PapaParse: `unknown`, read-excel-file: auch `Date`) in getrimmten String wandeln. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

export interface RawGridResult {
  grid: string[][];
  encoding: string;
  delimiter: "," | ";" | "\t" | null;
}

/**
 * Nur `.xlsx` (modernes OOXML-Format), bewusst kein `.xls` (altes Binärformat): die UI bietet
 * ohnehin nur `.csv,.xlsx` an, `read-excel-file` unterstützt `.xls` nicht, und `xlsx`/SheetJS
 * (das das könnte) hatte genau hier eine Prototype-Pollution-Lücke (CVE-2023-30533) – siehe
 * prompt-architektur-haertung.md A1.
 */
const XLSX_RE = /\.xlsx$/i;

/** Roh-Raster ohne Annahme, welche Zeile die Kopfzeile ist (für Schritt 1.5). */
export async function parseRawGrid(file: File): Promise<RawGridResult> {
  if (XLSX_RE.test(file.name)) {
    // v9-API: der Default-Export liefert alle Sheets zurück, `readSheet` gezielt nur das erste
    // (siehe Migrationshinweise 6.x -> 9.x im README von read-excel-file).
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    return {
      grid: rows.map((r) => r.map(cellToString)),
      encoding: "utf-8",
      delimiter: null,
    };
  }

  const buffer = await file.arrayBuffer();
  const encoding = detectEncoding(buffer);
  const text = new TextDecoder(encoding).decode(buffer);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const parsed = Papa.parse<unknown[]>(text, { delimiter, skipEmptyLines: true });
  return {
    grid: parsed.data.map((r) => (Array.isArray(r) ? r.map(cellToString) : [])),
    encoding,
    delimiter,
  };
}

function looksLikeHeaderRow(row: string[]): boolean {
  // Toleriere leere Felder am Ende (z.B. durch trailing commas).
  // Es muss mindestens 2 nicht-leere Spalten geben, die keine Daten sind.
  const nonEmpties = row.filter(c => c.trim() !== "");
  if (nonEmpties.length < 2) return false;
  return nonEmpties.every((cell) => !isParsableDate(cell) && !isNumericAmount(cell));
}

/**
 * Kriterium: erste Zeile, ab der alle Folgezeilen dieselbe Spaltenanzahl haben UND die
 * Zelleninhalte wie Spaltennamen aussehen (keine Daten/Beträge). Liefert `null` bei
 * Mehrdeutigkeit (z. B. DKB: Kontoname-/Kontostand-Zeilen vor der echten Kopfzeile).
 */
export function detectHeaderRowIndex(grid: string[][]): number | null {
  for (let r = 0; r < grid.length; r += 1) {
    const len = grid[r].length;
    if (len <= 1 || !looksLikeHeaderRow(grid[r])) continue;
    let consistent = true;
    for (let i = r; i < grid.length; i += 1) {
      if (grid[i].length > len) {
        consistent = false;
        break;
      }
    }
    if (consistent) return r;
  }
  return null;
}

export function splitHeaderAndRows(
  grid: string[][],
  headerRowIndex: number,
): { headers: string[]; rows: string[][] } {
  const headers = grid[headerRowIndex].map((h) => h.trim());
  const rows = grid
    .slice(headerRowIndex + 1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  return { headers, rows };
}

export function buildParsedFile(
  raw: RawGridResult,
  headerRowIndex: number,
): ParsedFile {
  const { headers, rows } = splitHeaderAndRows(raw.grid, headerRowIndex);
  return {
    headers,
    rows,
    detected: {
      encoding: raw.encoding,
      delimiter: raw.delimiter,
      decimalFormat: detectDecimalFormat(rows),
      dateFormat: detectDateFormat(rows) ?? "dd.MM.yyyy",
    },
  };
}

const KONTOSTAND_RE = /Kontostand\s+vom\s+(\d{2}\.\d{2}\.\d{4})\s*:?\s*([+-]?[\d.,]+)\s*(?:€|EUR)?/i;

export interface BalanceHint {
  date: string;
  cents: number;
}

/** Sucht in den verworfenen Zeilen vor der Kopfzeile nach "Kontostand vom TT.MM.JJJJ: X €". */
export function findBalanceHint(discardedRows: string[][]): BalanceHint | null {
  for (const row of discardedRows) {
    const text = row.join(" ");
    const match = KONTOSTAND_RE.exec(text);
    if (match) {
      try {
        return {
          date: parseGermanDateToIso(match[1]),
          cents: parseAmountWithFormat(match[2], "de"),
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}
