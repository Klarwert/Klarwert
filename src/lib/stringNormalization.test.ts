import { describe, it, expect } from "vitest";
import { normalizeString, normalizeCounterparty } from "@/lib/stringNormalization";

/**
 * Charakterisierungstests (C4): normalizeString und normalizeCounterparty sehen oberflächlich
 * ähnlich aus (beide: trim, lowercase, Whitespace kollabieren), unterscheiden sich aber bewusst -
 * normalizeCounterparty macht zusätzlich Umlaut-Transliteration, Sonderzeichen-Ersetzung, Anbieter-
 * Präfix- und Rechtsform-Entfernung, weil es speziell für Händler-/Gegenpartei-Namen gedacht ist
 * (siehe merchant-match.ts, contractDetection.ts), während normalizeString ein generischer
 * Textvergleich ist (siehe pipeline/suggest-category.ts für reine Kategorie-/Freitextvergleiche).
 * Diese Tests legen das AKTUELLE Verhalten fest, damit eine künftige Konsolidierung (oder ein
 * Refactor von stringNormalization.ts) eine unbeabsichtigte Verhaltensänderung sofort auffliegen
 * lässt, statt sie still in die automatische Kategorisierung durchsickern zu lassen.
 */
describe("normalizeString", () => {
  it("macht Kleinschreibung, trimmt und kollabiert Whitespace", () => {
    expect(normalizeString("  Rewe   Markt  ")).toBe("rewe markt");
  });

  it("lässt Umlaute unverändert (kein Transliterieren)", () => {
    expect(normalizeString("Käfer GmbH")).toBe("käfer gmbh");
  });

  it("lässt Rechtsform-Suffixe unverändert", () => {
    expect(normalizeString("Muster GmbH & Co. KG")).toBe("muster gmbh & co. kg");
  });

  it("lässt Sonderzeichen-Separatoren unverändert", () => {
    expect(normalizeString("SumUp *Kaffeebar")).toBe("sumup *kaffeebar");
  });

  it("behandelt null/undefined/leer als leeren String", () => {
    expect(normalizeString(null)).toBe("");
    expect(normalizeString(undefined)).toBe("");
    expect(normalizeString("")).toBe("");
  });
});

describe("normalizeCounterparty", () => {
  it("macht Kleinschreibung, trimmt und kollabiert Whitespace (wie normalizeString)", () => {
    expect(normalizeCounterparty("  Rewe   Markt  ")).toBe("rewe markt");
  });

  it("transliteriert Umlaute und ß, damit Schreibvarianten zusammenfallen", () => {
    expect(normalizeCounterparty("Käfer GmbH")).toBe("kaefer");
    expect(normalizeCounterparty("Kaefer GmbH")).toBe("kaefer");
    expect(normalizeCounterparty("Straße")).toBe("strasse");
  });

  it("entfernt gängige Rechtsform-Suffixe", () => {
    expect(normalizeCounterparty("Muster GmbH & Co. KG")).toBe("muster");
    expect(normalizeCounterparty("Muster AG")).toBe("muster");
    expect(normalizeCounterparty("Muster e.V.")).toBe("muster");
  });

  it("entfernt bekannte Zahlungsdienstleister-Präfixe (SumUp, Square, Zettle, PayLeven)", () => {
    expect(normalizeCounterparty("SumUp *Kaffeebar")).toBe("kaffeebar");
    expect(normalizeCounterparty("SQUARE *Foodtruck")).toBe("foodtruck");
  });

  it("ersetzt Sonderzeichen-Separatoren durch Leerzeichen statt sie stehen zu lassen", () => {
    expect(normalizeCounterparty("Muster/Mueller+Co")).toBe("muster mueller co");
  });

  it("behandelt null/undefined/leer als leeren String (wie normalizeString)", () => {
    expect(normalizeCounterparty(null)).toBe("");
    expect(normalizeCounterparty(undefined)).toBe("");
    expect(normalizeCounterparty("")).toBe("");
  });

  it("Kernunterschied zu normalizeString: dieselbe Eingabe kann auf unterschiedliche Werte normalisieren", () => {
    const input = "Käfer GmbH & Co. KG";
    expect(normalizeString(input)).toBe("käfer gmbh & co. kg");
    expect(normalizeCounterparty(input)).toBe("kaefer");
    expect(normalizeString(input)).not.toBe(normalizeCounterparty(input));
  });
});
