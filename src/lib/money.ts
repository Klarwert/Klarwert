import i18n from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";

function getLocale(): string {
  return i18n.language === "en" ? "en-US" : "de-DE";
}

function getCurrencyFormatter(): Intl.NumberFormat {
  const currency = useSettingsStore.getState().currency || "EUR";
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getCompactCurrencyFormatter(): Intl.NumberFormat {
  const currency = useSettingsStore.getState().currency || "EUR";
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function getNumberFormatter(): Intl.NumberFormat {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getCompactNumberFormatter(): Intl.NumberFormat {
  return new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 0,
  });
}

/**
 * Formatiert Integer-Cents als lokalen Euro-Betrag, z. B. DE: "1.240,00 €", EN: "€1,240.00".
 * Immer EUR – für andere Währungen `formatAmount(cents, currency)` verwenden.
 */
export function formatEur(cents: number): string {
  return getCurrencyFormatter().format(cents / 100);
}

/**
 * Liefert das Symbol der aktuell eingestellten Währung (z. B. "€", "$", "CHF") - für Beschriftungen
 * wie "Sparrate ({{currency}})", die sonst ein fest verdrahtetes "€" zeigen würden, egal welche
 * Währung eingestellt ist. Optional eine andere Währung übergeben (z. B. für einen konkreten Datensatz).
 */
export function getCurrencySymbol(currency?: string | null): string {
  const resolvedCurrency = currency || useSettingsStore.getState().currency || "EUR";
  try {
    const parts = new Intl.NumberFormat(getLocale(), { style: "currency", currency: resolvedCurrency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? resolvedCurrency;
  } catch {
    return resolvedCurrency;
  }
}

/**
 * React-Hook-Variante von `getCurrencySymbol()`: abonniert die Währungs-Einstellung reaktiv, damit
 * Komponenten neu rendern, sobald sie in den Einstellungen geändert wird (ein reiner Funktionsaufruf
 * ohne Subscription würde nur beim nächsten ohnehin stattfindenden Rerender aktualisieren).
 */
export function useCurrencySymbol(): string {
  const currency = useSettingsStore((s) => s.currency);
  return getCurrencySymbol(currency);
}

/**
 * Formatiert einen Betrag in Cents für eine beliebige Währung.
 * Fallback auf `formatEur` wenn `currency === 'EUR'` oder keine Währung angegeben.
 */
export function formatAmount(cents: number, currency?: string | null): string {
  if (!currency || currency === "EUR") return formatEur(cents);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    // Falls die Währung unbekannt ist (z. B. ein Fehler in Drittdaten), sicher auf EUR-Format fallback
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Formatiert Integer-Cents als kompakten Euro-Betrag ohne Cent-Stellen, z. B. DE: "1.240 €", EN: "€1,240". */
export function formatEurCompact(cents: number): string {
  return getCompactCurrencyFormatter().format(Math.round(cents / 100));
}

/** Formatiert eine Betrags-Texteingabe beim Verlassen des Feldes mit lokalem Tausenderpunkt (ohne Währungssymbol). */
export function formatAmountInputOnBlur(input: string): string {
  if (!input.trim()) return input;
  const cents = parseAmountToCents(input);
  return getNumberFormatter().format(cents / 100);
}

/** Formatiert eine Zahl mit lokalen Tausender-Punkten, z. B. DE: "100.000", EN: "100,000". */
export function formatNumberDe(num: number): string {
  return getCompactNumberFormatter().format(num);
}

/**
 * Y-Achsen-Beschriftung für Charts (Rechner u. a.): unter 1 Mio. € voller, gerundeter Betrag,
 * ab 1 Mio. € abgekürzt (z. B. DE: "1,2 Mio. €", EN: "€1.2M" o. ä.).
 */
export function formatAxisAmount(cents: number): string {
  const amount = cents / 100;
  if (Math.abs(amount) >= 1_000_000) {
    const mio = amount / 1_000_000;
    const locale = getLocale();
    const currency = useSettingsStore.getState().currency || "EUR";
    
    // Create a temporary formatter just to get the currency symbol
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0);
    const symbolPart = parts.find(p => p.type === "currency");
    const symbol = symbolPart ? symbolPart.value : "€";

    if (locale === "en-US") {
      return `${symbol}${mio.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
    }
    return `${mio.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio. ${symbol}`;
  }
  return formatEurCompact(cents);
}


/**
 * Normalisiert eine deutsche oder englische Zahleneingabe (Text) zu einem JS-Float nach der
 * "Letztes Zeichen gewinnt"-Regel: welches Zeichen (Komma/Punkt) zuletzt im String vorkommt, ist
 * der Dezimaltrenner, alle vorherigen Vorkommen desselben Zeichentyps sind Tausendertrenner.
 */
export function parseDecimalString(input: string): number {
  let normalized = input.trim().replace(/[€$\s+]/g, "");
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

/**
 * Parst eine Betrags-Texteingabe locale-abhängig in Integer-Cents.
 *
 * Grenzfall „1.234" (nur Punkt, drei Nachkommastellen):
 * - DE-Locale: wird als Tausender interpretiert → 123.400 Cents (1234 €)
 * - EN-Locale: wird als Dezimal interpretiert → 123 Cents (1.234 $)
 *
 * Alle anderen Fälle (Punkt + Komma, oder eindeutiger Dezimaltrenner) werden durch den
 * „Letztes Zeichen gewinnt"-Algorithmus in parseDecimalString robust aufgelöst.
 */
export function parseAmountInput(input: string, locale: "de" | "en" = "de"): number {
  const trimmed = input.trim().replace(/[€$\s+]/g, "");
  const lastComma = trimmed.lastIndexOf(",");
  const lastPoint = trimmed.lastIndexOf(".");

  // Grenzfall: nur ein einziger Punkt, exakt 3 Nachkommastellen → locale-abhängig
  if (lastPoint !== -1 && lastComma === -1) {
    const parts = trimmed.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      if (locale === "de") {
        // DE: "1.234" → Tausender → 123400 Cents
        const valueStr = trimmed.replace(".", "");
        const value = Number.parseFloat(valueStr);
        if (!Number.isNaN(value)) return Math.round(value * 100);
      }
      // EN: "1.234" → Dezimaltrenner → 123 Cents (fällt durch zu parseDecimalString)
    }
  }

  return parseAmountToCents(input);
}
