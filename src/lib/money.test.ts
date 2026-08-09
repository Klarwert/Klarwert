import { describe, it, expect } from "vitest";
import { formatEur, formatEurCompact, formatAxisAmount, parseAmountToCents, addCents } from "@/lib/money";

describe("formatEur", () => {
  it("formatiert Integer-Cents als deutschen Euro-Betrag", () => {
    expect(formatEur(124000)).toBe("1.240,00 €");
    expect(formatEur(0)).toBe("0,00 €");
    expect(formatEur(-500)).toBe("-5,00 €");
  });
});

describe("formatEurCompact / formatAxisAmount", () => {
  it("rundet ohne Cent-Stellen", () => {
    expect(formatEurCompact(124050)).toBe("1.241 €");
  });

  it("kürzt ab 1 Mio. € ab", () => {
    expect(formatAxisAmount(150_000_00)).toBe("150.000 €");
    expect(formatAxisAmount(1_200_000_00)).toBe("1,2 Mio. €");
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

describe("addCents", () => {
  it("summiert Integer-Cents ohne Floating-Point-Drift", () => {
    // Klassischer Float-Bug: 0.1 + 0.2 !== 0.3 in JS - bei Integer-Cents darf das nicht passieren.
    expect(addCents(10, 20, 30)).toBe(60);
    expect(addCents()).toBe(0);
  });
});
