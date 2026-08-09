const formatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

/** Formatiert Integer-Cents als deutschen Euro-Betrag, z. B. 124000 -> "1.240,00 €". */
export function formatEur(cents: number): string {
  return `${formatter.format(cents / 100)} €`;
}

/** Formatiert Integer-Cents als kompakten deutschen Euro-Betrag ohne Cent-Stellen, z. B. 124000 -> "1.240 €". */
export function formatEurCompact(cents: number): string {
  return `${compactFormatter.format(Math.round(cents / 100))} €`;
}

/** Formatiert eine Betrags-Texteingabe beim Verlassen des Feldes mit Tausenderpunkt (ohne €-Symbol). */
export function formatAmountInputOnBlur(input: string): string {
  if (!input.trim()) return input;
  const cents = parseAmountToCents(input);
  return formatter.format(cents / 100);
}

/** Formatiert eine Zahl mit Tausender-Punkten für deutsche Darstellung, z. B. 100000 -> "100.000". */
export function formatNumberDe(num: number): string {
  return compactFormatter.format(num);
}

/**
 * Y-Achsen-Beschriftung für Charts (Rechner u. a.): unter 1 Mio. € voller, gerundeter Betrag mit
 * Tausenderpunkt (z. B. "120.000 €"), ab 1 Mio. € abgekürzt (z. B. "1,2 Mio. €").
 */
export function formatAxisAmount(cents: number): string {
  const amount = cents / 100;
  if (Math.abs(amount) >= 1_000_000) {
    const mio = amount / 1_000_000;
    return `${mio.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio. €`;
  }
  return formatEurCompact(cents);
}


/**
 * Normalisiert eine deutsche oder englische Zahleneingabe (Text) zu einem JS-Float nach der
 * "Letztes Zeichen gewinnt"-Regel: welches Zeichen (Komma/Punkt) zuletzt im String vorkommt, ist
 * der Dezimaltrenner, alle vorherigen Vorkommen desselben Zeichentyps sind Tausendertrenner.
 */
export function parseDecimalString(input: string): number {
  let normalized = input.trim().replace(/[€\s+]/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastPoint = normalized.lastIndexOf(".");

  if (lastComma === -1 && lastPoint === -1) {
    // Weder noch: Ganzzahl
  } else if (lastPoint === -1) {
    // Nur Komma -> letztes Komma ist Dezimaltrenner
    normalized =
      normalized.substring(0, lastComma).replace(/,/g, "") +
      "." +
      normalized.substring(lastComma + 1);
  } else if (lastComma === -1) {
    // Nur Punkt -> letzter Punkt ist Dezimaltrenner
    normalized =
      normalized.substring(0, lastPoint).replace(/\./g, "") +
      "." +
      normalized.substring(lastPoint + 1);
  } else {
    // Beides vorhanden -> was zuletzt kommt, ist der Dezimaltrenner
    if (lastComma > lastPoint) {
      // Komma ist Dezimaltrenner (DE)
      normalized = normalized.replace(/\./g, ""); // Tausender-Punkte weg
      const newComma = normalized.lastIndexOf(",");
      normalized =
        normalized.substring(0, newComma).replace(/,/g, "") +
        "." +
        normalized.substring(newComma + 1);
    } else {
      // Punkt ist Dezimaltrenner (EN)
      normalized = normalized.replace(/,/g, ""); // Tausender-Kommas weg
      const newPoint = normalized.lastIndexOf(".");
      normalized =
        normalized.substring(0, newPoint).replace(/\./g, "") +
        "." +
        normalized.substring(newPoint + 1);
    }
  }

  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error(`Ungültiger Betrag: "${input}"`);
  }
  return value;
}

/** Parst eine deutsche oder englische Betragsangabe (Text) in Integer-Cents. */
export function parseAmountToCents(input: string): number {
  return Math.round(parseDecimalString(input) * 100);
}

export function addCents(...values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

/** 
 * Parst einen Betrag. Der format-Parameter wird ignoriert, da der 
 * "Letztes Zeichen gewinnt"-Algorithmus robuster ist (Punkt 6).
 */
export function parseAmountWithFormat(input: string, _format: "de" | "en"): number {
  return parseAmountToCents(input);
}
