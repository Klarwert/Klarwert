/** ISO-Datum (yyyy-MM-dd) für "heute", zur Validierung "Datum ≤ heute" u. Ä. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isIsoDateOnOrBeforeToday(iso: string): boolean {
  return iso <= todayIso();
}

const DE_DATE = /^(\d{2})\.(\d{2})\.(\d{2,4})$/;

/** Parst ein deutsches Datum (dd.MM.yyyy oder dd.MM.yy) in ISO (yyyy-MM-dd). */
export function parseGermanDateToIso(input: string): string {
  const match = DE_DATE.exec(input.trim());
  if (!match) {
    throw new Error(`Ungültiges Datum: "${input}"`);
  }
  const [, day, month, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return `${year}-${month}-${day}`;
}

/** Parst ein ISO-Datum (yyyy-MM-dd) unverändert (Passthrough mit Validierung). */
export function parseIsoDate(input: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    throw new Error(`Ungültiges ISO-Datum: "${input}"`);
  }
  return input.trim();
}

/** Parst ein Datum gemäß erkanntem Import-Format ('yyyy-MM-dd' oder dd.MM.yyyy/yy). */
export function parseDateWithFormat(input: string, format: string): string {
  if (format === "yyyy-MM-dd") return parseIsoDate(input);
  return parseGermanDateToIso(input);
}

/** Tag vor dem übergebenen ISO-Datum (für Anker-Datum: Vortag der ältesten Buchung). */
export function isoDayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type DisplayDateFormat = "dd.MM.yyyy" | "yyyy-MM-dd";

import i18n from "@/i18n";

/**
 * Formats an ISO date (yyyy-MM-dd) for display according to the user's preference and locale.
 * Falls back to localized format if format is unset or "dd.MM.yyyy" (which we treat as "local").
 */
export function formatDate(iso: string, format: DisplayDateFormat = "dd.MM.yyyy"): string {
  if (!iso || iso.length < 10) return iso;
  if (format === "yyyy-MM-dd") return iso;

  const locale = i18n.language === "en" ? "en-US" : "de-DE";
  const date = new Date(`${iso}T00:00:00Z`); // parse as UTC so the day doesn't shift
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC"
  }).format(date);
}
/**
 * Locale-abhängiger Wochenstart: Montag (DE, ISO-Standard) oder Sonntag (US).
 * Gibt 0 für Sonntag, 1 für Montag zurück (entspricht Date.getDay()-Wochentag).
 */
export function getWeekStartDay(): 0 | 1 {
  return i18n.language === "en" ? 0 : 1;
}

/**
 * Locale-abhängige Namens-/Kategorien-Sortierung über `localeCompare`.
 * Verhindert falsch einsortierte Umlaute (ä/ö/ü) im DE-Kontext.
 */
export function localeSortCompare(a: string, b: string): number {
  const locale = i18n.language === "en" ? "en-US" : "de-DE";
  return a.localeCompare(b, locale, { sensitivity: "base" });
}
