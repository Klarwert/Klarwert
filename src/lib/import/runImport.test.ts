import { describe, it, expect } from "vitest";
import { formatExtraFieldValue } from "@/lib/import/runImport";

describe("formatExtraFieldValue", () => {
  it("lässt Text unverändert", () => {
    expect(formatExtraFieldValue("Hallo Welt", "text")).toBe("Hallo Welt");
    expect(formatExtraFieldValue("Hallo Welt", undefined)).toBe("Hallo Welt");
  });

  it("normalisiert Ganzzahlen", () => {
    expect(formatExtraFieldValue("1.234", "integer")).toBe("1234");
    expect(formatExtraFieldValue("42", "integer")).toBe("42");
  });

  it("normalisiert Dezimalzahlen unabhängig vom Format", () => {
    expect(formatExtraFieldValue("1.234,56", "decimal")).toBe("1234.56");
    expect(formatExtraFieldValue("1,234.56", "decimal")).toBe("1234.56");
  });

  it("normalisiert Ja/Nein-Varianten", () => {
    expect(formatExtraFieldValue("Ja", "boolean")).toBe("Ja");
    expect(formatExtraFieldValue("false", "boolean")).toBe("Nein");
    expect(formatExtraFieldValue("1", "boolean")).toBe("Ja");
  });

  it("normalisiert Datum auf ISO, unabhängig vom Eingabeformat", () => {
    expect(formatExtraFieldValue("31.12.2023", "date")).toBe("2023-12-31");
    expect(formatExtraFieldValue("2023-12-31", "date")).toBe("2023-12-31");
  });

  it("normalisiert Datum+Uhrzeit auf ISO-Datum + Uhrzeit", () => {
    expect(formatExtraFieldValue("31.12.2023 14:05", "datetime")).toBe("2023-12-31 14:05");
  });

  it("gibt bei nicht parsbaren Werten den Rohwert zurück, statt zu werfen", () => {
    expect(formatExtraFieldValue("nicht ein datum", "date")).toBe("nicht ein datum");
    expect(formatExtraFieldValue("abc", "decimal")).toBe("abc");
  });
});
