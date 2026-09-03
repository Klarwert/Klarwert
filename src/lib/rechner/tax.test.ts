import { describe, it, expect } from "vitest";
import { getEffectiveCapitalTaxRate } from "./tax";

describe("getEffectiveCapitalTaxRate", () => {
  it("berechnet den Basis-Satz ohne Kirchensteuer", () => {
    expect(getEffectiveCapitalTaxRate(false, 8)).toBe(26.375);
    expect(getEffectiveCapitalTaxRate(false, 9)).toBe(26.375);
  });

  it("berechnet den Satz mit 8% Kirchensteuer", () => {
    expect(getEffectiveCapitalTaxRate(true, 8)).toBe(28.375);
  });

  it("berechnet den Satz mit 9% Kirchensteuer", () => {
    expect(getEffectiveCapitalTaxRate(true, 9)).toBe(28.625);
  });
});
