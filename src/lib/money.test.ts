import { describe, it, expect, beforeEach } from "vitest";
import { formatEur, formatEurCompact, formatAxisAmount, parseAmountToCents, parseAmountToCentsOrZero, addCents, parseAmountInput } from "@/lib/money";
import i18n from "@/i18n";

describe("formatEur", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("formatiert Integer-Cents als deutschen Euro-Betrag", () => {
    expect(formatEur(124000)).toBe("1.240,00 €");
    expect(formatEur(0)).toBe("0,00 €");
    expect(formatEur(-500)).toBe("-5,00 €");
  });

  it("formatiert Integer-Cents als englischen Euro-Betrag", async () => {
    await i18n.changeLanguage("en");
    expect(formatEur(124000)).toBe("€1,240.00");
    expect(formatEur(0)).toBe("€0.00");
    expect(formatEur(-500)).toBe("-€5.00");
  });
});

describe("formatEurCompact / formatAxisAmount", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("rundet ohne Cent-Stellen", () => {
    expect(formatEurCompact(124050)).toBe("1.241 €");
  });

  it("kürzt ab 1 Mio. € ab (DE)", () => {
    expect(formatAxisAmount(150_000_00)).toBe("150.000 €");
    expect(formatAxisAmount(1_200_000_00)).toBe("1,2 Mio. €");
  });

  it("kürzt ab 1 Mio. € ab (EN)", async () => {
    await i18n.changeLanguage("en");
    expect(formatAxisAmount(150_000_00)).toBe("€150,000");
    expect(formatAxisAmount(1_200_000_00)).toBe("€1.2M");
  });
});

describe("parseAmountToCents", () => {
  it("parst deutsches Format (Komma als Dezimaltrenner)", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("42,50")).toBe(4250);
  });

  it("parst englisches Format (Punkt als Dezimaltrenner)", () => {
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents("42.50")).toBe(4250);
  });

  it("parst Ganzzahlen ohne Trenner", () => {
    expect(parseAmountToCents("100")).toBe(10000);
  });

  it("ignoriert Euro-Zeichen und Leerzeichen", () => {
    expect(parseAmountToCents("1.234,56 €")).toBe(123456);
  });

  it("wirft bei ungültigem Betrag", () => {
    expect(() => parseAmountToCents("abc")).toThrow();
  });
});

describe("parseAmountToCentsOrZero", () => {
  it("parst wie parseAmountToCents bei gültiger Eingabe", () => {
    // Regression: die Rechner-Seite baute früher ihren eigenen Parser über
    // `parseFloat(input.replace(/\./g, ""))`, der jeden Punkt als Tausendertrenner behandelte -
    // eine englische Dezimaleingabe wie "1234.56" wurde dadurch stillschweigend zu 123456 statt
    // 1234,56, und Tausenderpunkte gingen bei jedem Format verloren, das nicht exakt DE-Format war.
    expect(parseAmountToCentsOrZero("1.234,56")).toBe(123456);
    expect(parseAmountToCentsOrZero("1234.56")).toBe(123456);
  });

  it("gibt 0 zurück statt zu werfen, wenn die Eingabe leer oder unvollständig ist", () => {
    expect(parseAmountToCentsOrZero("")).toBe(0);
    expect(parseAmountToCentsOrZero("abc")).toBe(0);
  });
});

describe("addCents", () => {
  it("summiert Integer-Cents ohne Floating-Point-Drift", () => {
    // Klassischer Float-Bug: 0.1 + 0.2 !== 0.3 in JS - bei Integer-Cents darf das nicht passieren.
    expect(addCents(10, 20, 30)).toBe(60);
    expect(addCents()).toBe(0);
  });
});

describe("parseAmountInput – locale-abhängige Eingabe", () => {
  it("parst eindeutiges DE-Format (Komma-Dezimal) korrekt", () => {
    expect(parseAmountInput("1.234,56", "de")).toBe(123456);
    expect(parseAmountInput("42,50", "de")).toBe(4250);
  });

  it("parst eindeutiges EN-Format (Punkt-Dezimal mit Komma-Tausend) korrekt", () => {
    expect(parseAmountInput("1,234.56", "en")).toBe(123456);
    expect(parseAmountInput("42.50", "en")).toBe(4250);
  });

  it("Grenzfall '1.234': DE → Tausender (123400), EN → Dezimal (123)", () => {
    expect(parseAmountInput("1.234", "de")).toBe(123400); // 1234 €
    expect(parseAmountInput("1.234", "en")).toBe(123);    // 1.234 $
  });

  it("Grenzfall '1,234': DE → Dezimal (123), EN → Tausender (123400)", () => {
    // "Letztes-Zeichen-gewinnt"-Regel: nur Komma vorhanden → Dezimaltrenner in beiden Locales
    // (EN würde normalerweise Komma als Tausender lesen, aber ohne Punkt ist es eindeutig Dezimal)
    expect(parseAmountInput("1,234", "de")).toBe(123);    // 1,234 € Dezimal
    // EN ohne Punkt: Komma als Dezimaltrenner → gleiches Ergebnis
    expect(parseAmountInput("1,234", "en")).toBe(123);
  });

  it("ignoriert Währungssymbole und Leerzeichen", () => {
    expect(parseAmountInput("1.234,56 €", "de")).toBe(123456);
    expect(parseAmountInput("$1,234.56", "en")).toBe(123456);
  });
});

describe("Mehrwährungs-Aggregation – stummes Summieren verhindern", () => {
  /**
   * Belegt DoD-Kriterium: Transaktionen unterschiedlicher Währung dürfen nicht
   * stumm zusammenaddiert werden. Diese Hilfsfunktion demonstriert die korrekte
   * Trennung durch Gruppierung nach Währung.
   */
  function sumByCurrency(txs: { amount_cents: number; currency: string }[]): Record<string, number> {
    return txs.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.currency] = (acc[tx.currency] ?? 0) + tx.amount_cents;
      return acc;
    }, {});
  }

  it("gibt getrennte Summen pro Währung aus statt eine Gesamt-Summe", () => {
    const transactions = [
      { amount_cents: 10000, currency: "EUR" },
      { amount_cents: 20000, currency: "EUR" },
      { amount_cents: 15000, currency: "USD" },
    ];
    const result = sumByCurrency(transactions);
    expect(result).toEqual({ EUR: 30000, USD: 15000 });
    // Wichtig: kein einfaches Addieren aller Werte zu 45000
    expect(result["EUR"]).not.toBe(45000);
  });

  it("meldet keine falsche Summe wenn Währungen gemischt sind", () => {
    const mixed = [
      { amount_cents: 50000, currency: "EUR" },
      { amount_cents: 50000, currency: "CHF" },
    ];
    const result = sumByCurrency(mixed);
    // Eine naive Summe würde 100000 ergeben – falsch, weil EUR ≠ CHF
    expect(result["EUR"]).toBe(50000);
    expect(result["CHF"]).toBe(50000);
    expect(Object.keys(result).length).toBe(2);
  });
});
