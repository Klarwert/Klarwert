import { describe, it, expect } from "vitest";
import { calculateEntnahme } from "@/lib/rechner/entnahme";

describe("calculateEntnahme", () => {
  it("bei 0 % Rendite sinkt das Kapital exakt um die Entnahmen (von Hand nachgerechnet)", () => {
    // 120.000 € Kapital, 1.000 €/Monat = 12.000 €/Jahr Entnahme, 0 % Rendite/Inflation/Steuer.
    // Nach 1 Jahr: 120.000 - 12.000 = 108.000 €.
    const result = calculateEntnahme({
      initialCapitalCents: 12_000_000,
      monthlyWithdrawalCents: 100_000,
      adjustForInflation: false,
      horizonYears: 1,
      interestRatePercent: 0,
      inflationPercent: 0,
      terPercent: 0,
      taxActive: false,
      taxRatePercent: 0,
    });
    expect(result.endBalanceCents).toBe(10_800_000);
    expect(result.totalWithdrawalsCents).toBe(1_200_000);
    expect(result.capitalDepletedInYear).toBeNull();
  });

  it("negative Entnahme (Rate 0) verzehrt das Kapital nicht", () => {
    const result = calculateEntnahme({
      initialCapitalCents: 1_000_000,
      monthlyWithdrawalCents: 0,
      adjustForInflation: false,
      horizonYears: 5,
      interestRatePercent: 3,
      inflationPercent: 0,
      terPercent: 0,
      taxActive: false,
      taxRatePercent: 0,
    });
    expect(result.endBalanceCents).toBeGreaterThan(1_000_000);
    expect(result.capitalDepletedInYear).toBeNull();
  });

  it("erkennt vollständigen Kapitalverzehr innerhalb des Zeithorizonts", () => {
    const result = calculateEntnahme({
      initialCapitalCents: 100_000,
      monthlyWithdrawalCents: 50_000,
      adjustForInflation: false,
      horizonYears: 10,
      interestRatePercent: 0,
      inflationPercent: 0,
      terPercent: 0,
      taxActive: false,
      taxRatePercent: 0,
      userAge: 67,
    });
    expect(result.endBalanceCents).toBe(0);
    expect(result.capitalDepletedInYear).not.toBeNull();
    expect(result.capitalDepletedAtAge).not.toBeNull();
  });

  it("Zeithorizont 0 liefert nur den Startpunkt", () => {
    const result = calculateEntnahme({
      initialCapitalCents: 500_000,
      monthlyWithdrawalCents: 10_000,
      adjustForInflation: false,
      horizonYears: 0,
      interestRatePercent: 4,
      inflationPercent: 2,
      terPercent: 0,
      taxActive: false,
      taxRatePercent: 0,
    });
    expect(result.yearlyPoints).toHaveLength(1);
    expect(result.endBalanceCents).toBe(500_000);
  });
});
