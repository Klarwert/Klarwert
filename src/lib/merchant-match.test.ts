import { describe, it, expect } from "vitest";
import { normalizeCounterparty, calculateSimilarity, extractMerchantFromPaymentProvider } from "@/lib/merchant-match";

describe("normalizeCounterparty", () => {
  it("ist case-insensitiv und transliteriert Umlaute", () => {
    expect(normalizeCounterparty("REWE")).toBe(normalizeCounterparty("rewe"));
    expect(normalizeCounterparty("Käfer")).toContain("kaefer");
  });

  it("entfernt Rechtsform-Suffixe wie GmbH", () => {
    expect(normalizeCounterparty("Beispiel GmbH")).not.toContain("gmbh");
  });

  it("liefert für leere Eingabe einen leeren String", () => {
    expect(normalizeCounterparty("")).toBe("");
  });
});

describe("calculateSimilarity", () => {
  it("ist 1 für identische (normalisierte) Namen", () => {
    expect(calculateSimilarity("REWE Markt", "rewe markt")).toBe(1);
  });

  it("ist 0 für eine leere Eingabe", () => {
    expect(calculateSimilarity("", "REWE")).toBe(0);
  });

  it("erkennt typische Buchungstext-Varianten als ähnlich (keine Kollision mit unähnlichen Namen)", () => {
    const similar = calculateSimilarity("REWE Markt Berlin", "REWE Markt");
    const different = calculateSimilarity("REWE Markt Berlin", "Aral Tankstelle");
    expect(similar).toBeGreaterThan(0.7);
    expect(different).toBeLessThan(similar);
  });
});

describe("extractMerchantFromPaymentProvider", () => {
  it("extrahiert den Händler aus einem PayPal-Buchungstext", () => {
    const result = extractMerchantFromPaymentProvider({ counterparty: "PAYPAL *SPOTIFY", purpose: null });
    expect(result.merchantName).toBe("SPOTIFY");
  });

  it("liefert null, wenn kein Zahlungsdienstleister erkannt wird", () => {
    const result = extractMerchantFromPaymentProvider({ counterparty: "REWE Markt", purpose: null });
    expect(result.merchantName).toBeNull();
  });
});
