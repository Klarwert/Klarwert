import { describe, it, expect } from "vitest";
import { computeHeaderFingerprint } from "@/lib/import/fingerprint";

describe("computeHeaderFingerprint", () => {
  it("liefert für dieselben Spalten immer denselben Fingerprint (Determinismus)", () => {
    const headers = ["Buchungstag", "Betrag", "Verwendungszweck"];
    expect(computeHeaderFingerprint(headers)).toBe(computeHeaderFingerprint([...headers]));
  });

  it("ist unabhängig von der Spaltenreihenfolge", () => {
    const a = computeHeaderFingerprint(["Buchungstag", "Betrag", "Verwendungszweck"]);
    const b = computeHeaderFingerprint(["Verwendungszweck", "Buchungstag", "Betrag"]);
    expect(a).toBe(b);
  });

  it("normalisiert Umlaute/Groß-Kleinschreibung/Sonderzeichen", () => {
    const a = computeHeaderFingerprint(["Empfänger", "Größe"]);
    const b = computeHeaderFingerprint(["EMPFAENGER", "GROESSE"]);
    expect(a).toBe(b);
  });

  it("liefert für unterschiedliche Spalten unterschiedliche Fingerprints (keine Kollision)", () => {
    const dkb = computeHeaderFingerprint(["Buchungsdatum", "Betrag (€)", "Verwendungszweck", "IBAN"]);
    const sparkasse = computeHeaderFingerprint([
      "Buchungstag",
      "Betrag",
      "Beguenstigter/Zahlungspflichtiger",
      "Verwendungszweck",
    ]);
    expect(dkb).not.toBe(sparkasse);
  });
});
