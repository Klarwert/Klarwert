/** Normalisierte, sortierte Verkettung der Spaltennamen zur Bankprofil-Auto-Erkennung. */
export function computeHeaderFingerprint(headers: string[]): string {
  return headers
    .map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9]/g, ""),
    )
    .filter(Boolean)
    .sort()
    .join("|");
}
