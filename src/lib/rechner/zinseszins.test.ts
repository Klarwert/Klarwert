import { describe, it, expect } from "vitest";
import { calculateZinseszins } from "@/lib/rechner/zinseszins";

describe("calculateZinseszins", () => {
  it("verzinst reines Startkapital ohne Sparrate korrekt (von Hand nachgerechnet)", () => {
    // 10.000 € bei 5 % p.a., 1 Jahr, keine Sparrate, keine Inflation/TER/Steuer.
    // Erwartung: 10.000 * 1.05 = 10.500 €.
    const result = calculateZinseszins({
      initialCapitalCents: 1_000_000,
      monthlySavingsRateCents: 0,
      annualSavingsIncreasePercent: 0,
      interestRatePercent: 5,
      years: 1,
      inflationPercent: 0,
      terPercent: 0,
      taxActive: false,
      taxRatePercent: 0,
      payoutType: "thesaurierend",
    });
    expect(result.endCapitalNominalCents).toBe(1_050_000);
    expect(result.totalContributionsCents).toBe(1_000_000);
  });

  it("bei 0 % Rendite bleibt das Kapital exakt gleich der Summe der Einzahlungen", () => {
    const result = calculateZinseszins({
      initialCapitalCents: 100_000,
      monthlySavingsRateCents: 10_000,
      annualSavingsIncreasePercent: 0,
      interestRatePercent: 0,
      years: 2,
      inflationPercent: 0,
      terPercent: 0,
      taxActive: false,
      taxRatePercent: 0,
      payoutType: "thesaurierend",
    });
    expect(result.endCapitalNominalCents).toBe(100_000 + 10_000 * 24);
    expect(result.totalEarningsCents).toBe(0);
  });

  it("Laufzeit 0 liefert nur den Startpunkt ohne Wachstum", () => {
    const result = calculateZinseszins({
      initialCapitalCents: 500_000,
      monthlySavingsRateCents: 5_000,
      annualSavingsIncreasePercent: 0,
      interestRatePercent: 6,
      years: 0,
      inflationPercent: 2,
      terPercent: 0,
      taxActive: false,
      taxRatePercent: 0,
      payoutType: "thesaurierend",
    });
    expect(result.yearlyPoints).toHaveLength(1);
    expect(result.endCapitalNominalCents).toBe(500_000);
  });

  it("thesaurierend versteuert erst am Ende, ausschüttend jährlich", () => {
    const base = {
      initialCapitalCents: 1_000_000,
      monthlySavingsRateCents: 0,
      annualSavingsIncreasePercent: 0,
      interestRatePercent: 10,
      years: 3,
      inflationPercent: 0,
      terPercent: 0,
      taxActive: true,
      taxRatePercent: 26.375,
    };
    const thesaurierend = calculateZinseszins({ ...base, payoutType: "thesaurierend" });
    const ausschuettend = calculateZinseszins({ ...base, payoutType: "ausschüttend" });
    // Ausschüttend zahlt jedes Jahr Steuer auf den Gewinn -> geringeres Endkapital als thesaurierend,
    // wo der Zinseszinseffekt bis zum Schluss ungebremst läuft.
    expect(ausschuettend.endCapitalNominalCents).toBeLessThan(thesaurierend.endCapitalNominalCents);
    expect(thesaurierend.totalTaxesCents).toBeGreaterThan(0);
    expect(ausschuettend.totalTaxesCents).toBeGreaterThan(0);
  });
});
