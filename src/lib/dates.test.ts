import { describe, it, expect, beforeEach } from "vitest";
import {
  parseGermanDateToIso,
  parseIsoDate,
  parseDateWithFormat,
  isoDayBefore,
  formatDate,
} from "@/lib/dates";
import i18n from "@/i18n";

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
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("formatiert nach dd.MM.yyyy (Default)", () => {
    expect(formatDate("2023-12-31")).toBe("31.12.2023");
  });

  it("formatiert nach dd.MM.yy", () => {
    expect(formatDate("2023-12-31", "dd.MM.yy")).toBe("31.12.23");
  });

  it("formatiert nach dd/MM/yyyy", () => {
    expect(formatDate("2023-12-31", "dd/MM/yyyy")).toBe("31/12/2023");
  });

  it("formatiert nach MM/dd/yyyy", () => {
    expect(formatDate("2023-12-31", "MM/dd/yyyy")).toBe("12/31/2023");
  });

  it("Datumsformat ist unabhängig von der Sprach-Einstellung", async () => {
    expect(formatDate("2023-12-31", "dd.MM.yyyy")).toBe("31.12.2023");
    await i18n.changeLanguage("en");
    expect(formatDate("2023-12-31", "dd.MM.yyyy")).toBe("31.12.2023");
    expect(formatDate("2023-12-31", "yyyy-MM-dd")).toBe("2023-12-31");
  });

  it("gibt leere/kurze Eingaben unverändert zurück", () => {
    expect(formatDate("")).toBe("");
  });
});
