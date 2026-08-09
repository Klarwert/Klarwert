import { describe, it, expect } from "vitest";
import { calculateFire } from "@/lib/rechner/fire";

describe("calculateFire", () => {
  it("Modus 'how_much' bei 0 % Rendite (von Hand nachgerechnet)", () => {
    // Ziel: 2.000 €/Monat Netto-Bedarf, SWR 4 %, 0 % Steuer -> benötigtes Kapital
    // = (2.000 * 12) / 0,04 = 600.000 €. Bei 0 % Rendite über 10 Jahre (30 -> 40) verteilt sich das
    // linear auf 120 Monate: 600.000 € / 120 = 5.000 €/Monat Sparrate.
    const result = calculateFire({
      mode: "how_much",
      monthlyNetIncomeCents: 200_000,
      expectedReturnPercent: 0,
      inflationPercent: 0,
      swrPercent: 4,
      taxRatePercent: 0,
      teilfreistellung: false,
      currentCapitalCents: 0,
      monthlySavingsRateCents: 0,
      targetAge: 40,
      capitalDepletion: false,
      currentAge: 30,
      startYear: 2024,
    });
    expect(result.requiredCapitalCents).toBe(60_000_000);
    expect(result.monthlySavingsRateCents).toBe(500_000);
    expect(result.yearsToFire).toBe(10);
    expect(result.fireAge).toBe(40);
    expect(result.fireYear).toBe(2034);
  });

  it("Modus 'when_free': bereits erreichtes Kapital ergibt 0 Jahre bis FIRE", () => {
    const result = calculateFire({
      mode: "when_free",
      monthlyNetIncomeCents: 200_000,
      expectedReturnPercent: 5,
      inflationPercent: 2,
      swrPercent: 4,
      taxRatePercent: 0,
      teilfreistellung: false,
      currentCapitalCents: 100_000_000,
      monthlySavingsRateCents: 100_000,
      targetAge: 0,
      capitalDepletion: false,
      currentAge: 30,
      startYear: 2024,
    });
    expect(result.yearsToFire).toBe(0);
    expect(result.fireAge).toBe(30);
    expect(result.progressPercent).toBe(100);
  });

  it("negative/keine Sparrate im Modus 'when_free' bricht nicht ab, sondern liefert einen hohen, aber endlichen Horizont", () => {
    const result = calculateFire({
      mode: "when_free",
      monthlyNetIncomeCents: 200_000,
      expectedReturnPercent: 0,
      inflationPercent: 0,
      swrPercent: 4,
      taxRatePercent: 0,
      teilfreistellung: false,
      currentCapitalCents: 0,
      monthlySavingsRateCents: 0,
      targetAge: 0,
      capitalDepletion: false,
      currentAge: 30,
      startYear: 2024,
    });
    expect(result.yearsToFire).toBeGreaterThan(0);
    expect(Number.isFinite(result.yearsToFire)).toBe(true);
  });
});
