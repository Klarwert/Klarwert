/**
 * Normalisiert einen beliebigen Textstring für unscharfe Vergleiche.
 * - Kleinschreibung
 * - Führende/abschließende Leerzeichen entfernen
 * - Mehrere aufeinanderfolgende Leerzeichen zu einem zusammenfassen
 */
export function normalizeString(text: string | null | undefined): string {
  if (!text) return "";
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Normalisiert explizit einen Händler- oder Gegenpartei-Namen.
 * Beinhaltet Transliteration von Umlauten, Entfernen von Sonderzeichen,
 * sowie das Bereinigen bekannter Präfixe und Rechtsform-Zusätze.
 */
export function normalizeCounterparty(text: string | null | undefined): string {
  if (!text) return "";
  let s = text.trim().toLowerCase();

  // Umlaute/ß transliterieren, damit z. B. "Käfer GmbH" und "Kaefer" denselben Normalform-Wert ergeben
  s = s
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  // Ersetze Sonderzeichen-Separatoren durch Leerzeichen
  s = s.replace(/[/_\\+*]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Entferne bekannte Präfixe wie "sumup *", "square *", "zettle *", "payleven *"
  s = s.replace(/^(sumup|square|zettle|payleven|gopay)\s*\*\s*/i, "");

  // Entferne gängige Rechtsform-Suffixe (gmbh & co. kg, gmbh, mbh, ag, kg, ohg, ug, e.k., e.v.)
  s = s.replace(/\b(gmbh\s*&\s*co\s*\.?\s*kg|gmbh|mbh|ag|kg|ohg|ug|e\s*\.?\s*k\s*\.?|e\s*\.?\s*v\s*\.?)\b\.?/gi, "");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}
