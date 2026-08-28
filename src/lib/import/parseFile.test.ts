import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRawGrid, detectHeaderRowIndex, buildParsedFile } from "@/lib/import/parseFile";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");

/**
 * Verifiziert die Umstellung von `xlsx`/SheetJS (CVE-2023-30533, Prototype Pollution) auf
 * `read-excel-file` (siehe prompt-architektur-haertung.md A1). Ohne dieses Fixture wäre die
 * Umstellung nicht end-to-end abgesichert gewesen.
 */
describe("parseRawGrid – .xlsx (read-excel-file statt xlsx/SheetJS)", () => {
  it("liest eine echte .xlsx-Datei in dasselbe Zeilen-Array-Format wie CSV", async () => {
    const buffer = readFileSync(path.join(fixtureDir, "sample.xlsx"));
    const file = new File([buffer], "sample.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const raw = await parseRawGrid(file);
    expect(raw.delimiter).toBeNull();
    expect(raw.grid[0]).toEqual(["Buchungstag", "Betrag", "Empfaenger", "Verwendungszweck"]);
    expect(raw.grid[1]).toEqual(["01.06.2024", "-42,50", "REWE Markt", "Einkauf"]);
    expect(raw.grid[2]).toEqual(["02.06.2024", "1200,00", "Arbeitgeber GmbH", "Gehalt Juni"]);

    const headerIdx = detectHeaderRowIndex(raw.grid);
    expect(headerIdx).toBe(0);
    const parsed = buildParsedFile(raw, headerIdx!);
    expect(parsed.headers).toEqual(["Buchungstag", "Betrag", "Empfaenger", "Verwendungszweck"]);
    expect(parsed.rows).toHaveLength(2);
  });
});
