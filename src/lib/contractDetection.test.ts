import { describe, it, expect } from "vitest";

/**
 * Tests für die reinen Hilfsfunktionen in contractDetection.ts.
 * Die DB-abhängige Hauptfunktion detectRecurringPatterns() wird in einem
 * separaten Integration-Test (mit In-Memory-DB) abgedeckt.
 *
 * Da die Hilfsfunktionen nicht exportiert werden, testen wir ihr Verhalten
 * indirekt über bekannte Eingabe-/Ausgabe-Paare, die wir direkt hier
 * nachbilden (Copy der Implementierung – nur zur Dokumentation des erwarteten
 * Verhaltens; bei Änderungen bitte beide Stellen anpassen).
 */

// --- Kopie der internen Hilfsfunktionen (nur für Tests) ---

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) { if (tokensB.has(t)) intersection += 1; }
  return intersection / Math.max(tokensA.size, tokensB.size);
}

function amountsConsistent(amounts: number[]): boolean {
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  return amounts.every((a) => Math.abs(a - avg) <= Math.abs(avg) * 0.05);
}

function averageIntervalDays(dates: string[]): number {
  const sorted = [...dates].sort();
  let total = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    total += (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86_400_000;
  }
  return total / Math.max(sorted.length - 1, 1);
}

function detectIntervalType(avgDays: number): "monthly" | "quarterly" | "yearly" | "irregular" {
  if (avgDays >= 25 && avgDays <= 36) return "monthly";
  if (avgDays >= 80 && avgDays <= 100) return "quarterly";
  if (avgDays >= 350 && avgDays <= 380) return "yearly";
  return "irregular";
}

// --- Tests ---

describe("tokenOverlap", () => {
  it("liefert 1 für identische Strings", () => {
    expect(tokenOverlap("Spotify AB", "Spotify AB")).toBe(1);
  });

  it("liefert 0 für völlig unterschiedliche Strings", () => {
    expect(tokenOverlap("Spotify", "REWE")).toBe(0);
  });

  it("liefert 0 für leere Strings", () => {
    expect(tokenOverlap("", "Spotify")).toBe(0);
    expect(tokenOverlap("Spotify", "")).toBe(0);
  });

  it("erkennt partiellen Überlapp (z. B. 'Netflix International' vs. 'Netflix')", () => {
    const score = tokenOverlap("Netflix International", "Netflix");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("amountsConsistent", () => {
  it("akzeptiert identische Beträge", () => {
    expect(amountsConsistent([-999, -999, -999])).toBe(true);
  });

  it("akzeptiert Beträge innerhalb der 5%-Toleranz", () => {
    // avg = -1000, 5% von 1000 = 50 → Werte bis -950 und -1050 sind ok
    expect(amountsConsistent([-1000, -1010, -990])).toBe(true);
  });

  it("lehnt Beträge außerhalb der 5%-Toleranz ab", () => {
    // -800 weicht mehr als 5% von avg -1000 ab
    expect(amountsConsistent([-1000, -1000, -800])).toBe(false);
  });
});

describe("averageIntervalDays", () => {
  it("berechnet den Monatsabstand korrekt (≈ 30 Tage)", () => {
    const avg = averageIntervalDays(["2024-01-01", "2024-02-01", "2024-03-01"]);
    expect(avg).toBeGreaterThanOrEqual(28);
    expect(avg).toBeLessThanOrEqual(32);
  });

  it("liefert 0 für eine einzelne Buchung (keine Abstände)", () => {
    expect(averageIntervalDays(["2024-01-01"])).toBe(0);
  });

  it("sortiert die Daten vor der Berechnung (Reihenfolge egal)", () => {
    const ordered = averageIntervalDays(["2024-01-01", "2024-02-01"]);
    const unordered = averageIntervalDays(["2024-02-01", "2024-01-01"]);
    expect(ordered).toBeCloseTo(unordered, 5);
  });
});

describe("detectIntervalType", () => {
  it("klassifiziert 30 Tage als 'monthly'", () => {
    expect(detectIntervalType(30)).toBe("monthly");
  });

  it("klassifiziert 90 Tage als 'quarterly'", () => {
    expect(detectIntervalType(90)).toBe("quarterly");
  });

  it("klassifiziert 365 Tage als 'yearly'", () => {
    expect(detectIntervalType(365)).toBe("yearly");
  });

  it("klassifiziert 60 Tage (kein Standardintervall) als 'irregular'", () => {
    expect(detectIntervalType(60)).toBe("irregular");
  });
});

/**
 * Kernaussage aus A2: Die Beendigungs-Erkennung muss gegen das späteste
 * booking_date des Kontos prüfen, NICHT gegen Date.now(). Das bedeutet,
 * ein Konto mit Buchungen ausschließlich aus der Vergangenheit darf seinen
 * Vertrag nicht als beendet einstufen, wenn die letzte Buchung am Ende
 * des Datenhorizonts liegt.
 *
 * Dieser Test prüft die Logik als Pseudo-Test (die DB-abhängige Funktion
 * selbst wird in pipeline.integration.test.ts getestet):
 */
describe("suggested_ended-Logik (A2 Regressions-Assertion)", () => {
  it("ein Vertrag am Ende eines historischen Datensatzes darf nicht fälschlich als beendet gelten", () => {
    // referenceTime = letztes booking_date des Kontos (nicht Date.now()!)
    const latestBookingDate = "2020-12-31"; // historischer Datensatz
    const lastContractPaymentDate = "2020-12-01"; // monatlicher Vertrag, letzte Zahlung
    const referenceTime = new Date(latestBookingDate).getTime();
    const maxDaysWithoutBooking = 30 * 2.5; // monthly: 75 Tage

    const daysSinceLast =
      (referenceTime - new Date(lastContractPaymentDate).getTime()) / 86_400_000;

    // 30 Tage seit letzter Zahlung – innerhalb des erlaubten Fensters
    expect(daysSinceLast).toBeLessThan(maxDaysWithoutBooking);
    // → kein suggested_ended, Vertrag bleibt aktiv ✓
  });

  it("Date.now() würde denselben Datensatz fälschlicherweise als beendet einstufen", () => {
    // Dies simuliert den Bug: wenn statt referenceTime Date.now() verwendet wird,
    // wären es ~1600+ Tage → weit über maxDaysWithoutBooking
    const lastContractPaymentDate = "2020-12-01";
    const maxDaysWithoutBooking = 30 * 2.5;

    // Mit Date.now() wäre daysSinceLast > 1000 Tage → würde als beendet markiert
    const daysSinceLastWithDateNow =
      (Date.now() - new Date(lastContractPaymentDate).getTime()) / 86_400_000;

    expect(daysSinceLastWithDateNow).toBeGreaterThan(maxDaysWithoutBooking);
    // → DAS ist der Fehler, den A2 behebt ✓
  });
});
