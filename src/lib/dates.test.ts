import { describe, it, expect } from "vitest";
import {
  parseGermanDateToIso,
  parseIsoDate,
  parseDateWithFormat,
  isoDayBefore,
  formatDate,
} from "@/lib/dates";

describe("parseGermanDateToIso", () => {
  it("parst dd.MM.yyyy", () => {
    expect(parseGermanDateToIso("31.12.2023")).toBe("2023-12-31");
  });

  it("parst dd.MM.yy (zweistelliges Jahr) mit 20-Präfix", () => {
    expect(parseGermanDateToIso("05.01.24")).toBe("2024-01-05");
  });

  it("wirft bei ungültigem Format", () => {
    expect(() => parseGermanDateToIso("2023-12-31")).toThrow();
  });
});

describe("parseIsoDate", () => {
  it("lässt gültiges ISO-Datum unverändert durch", () => {
    expect(parseIsoDate("2023-12-31")).toBe("2023-12-31");
  });

  it("wirft bei ungültigem ISO-Format", () => {
    expect(() => parseIsoDate("31.12.2023")).toThrow();
  });
});

describe("parseDateWithFormat", () => {
  it("wählt den richtigen Parser je Format", () => {
    expect(parseDateWithFormat("2023-12-31", "yyyy-MM-dd")).toBe("2023-12-31");
    expect(parseDateWithFormat("31.12.2023", "dd.MM.yyyy")).toBe("2023-12-31");
    expect(parseDateWithFormat("31.12.23", "dd.MM.yy")).toBe("2023-12-31");
  });
});

describe("isoDayBefore", () => {
  it("liefert den Vortag", () => {
    expect(isoDayBefore("2024-01-01")).toBe("2023-12-31");
  });
});

describe("formatDate", () => {
  it("formatiert nach de-Anzeigeformat (Default)", () => {
    expect(formatDate("2023-12-31")).toBe("31.12.2023");
  });

  it("formatiert nach iso-Anzeigeformat", () => {
    expect(formatDate("2023-12-31", "yyyy-MM-dd")).toBe("2023-12-31");
  });

  it("gibt leere/kurze Eingaben unverändert zurück", () => {
    expect(formatDate("")).toBe("");
  });
});
