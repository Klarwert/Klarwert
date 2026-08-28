/**
 * Händler-Matching Utilities: Normalisierung, Zahlungsdienstleister-Extraktion & Fuzzy-Similarity
 */

// Normalisierung kommt aus der zentralen Utility – importiert für lokale Nutzung und re-exportiert für Abwärtskompatibilität
import { normalizeCounterparty } from "@/lib/stringNormalization";
export { normalizeCounterparty } from "@/lib/stringNormalization";


/** Blockliste für reine Zahlungsdienstleister (ohne auflösbaren Händler) */
const PAYMENT_PROVIDER_BLOCKLIST = new Set([
  "paypal",
  "paypal europe",
  "paypal europe sarl",
  "klarna",
  "klarna bank",
  "klarna ab",
  "stripe",
  "sumup",
  "mollie",
  "adyen",
  "ratepay",
  "payone",
]);

/**
 * Extrahiert den eigentlichen Händlernamen aus PayPal / Klarna / Stripe Transaktionen.
 * Gibt null zurück, wenn kein Dienstleister erkannt wurde oder die Extraktion fehlschlug.
 */
export function extractMerchantFromPaymentProvider(tx: {
  counterparty: string;
  purpose?: string | null;
}): { merchantName: string | null; extractedFrom: "counterparty" | "purpose" | null } {
  const cp = tx.counterparty.trim();
  const cpLower = cp.toLowerCase();

  // 1. PayPal im Counterparty-Feld (z.B. "PAYPAL *REWE ONLINE", "PP.1234.PAYPAL *SPOTIFY")
  if (cpLower.includes("paypal") || cpLower.startsWith("pp.")) {
    // Versuche Empfänger nach '*' oder 'paypal' im counterparty-String zu parsen
    const starMatch = cp.match(/(?:paypal|pp\.\d+)\s*\*\s*([^,*]+)/i);
    if (starMatch && starMatch[1].trim().length > 1) {
      const extracted = starMatch[1].trim();
      if (!PAYMENT_PROVIDER_BLOCKLIST.has(extracted.toLowerCase())) {
        return { merchantName: extracted, extractedFrom: "counterparty" };
      }
    }


  }

  // 2. Klarna im Counterparty-Feld (z.B. "Klarna / Zalando", "Klarna AB - Spotify")
  if (cpLower.includes("klarna")) {
    const slashMatch = cp.match(/klarna(?:\s+ab|\s+bank)?\s*[-/:]\s*([^,*]+)/i);
    if (slashMatch && slashMatch[1].trim().length > 1) {
      const extracted = slashMatch[1].trim();
      if (!PAYMENT_PROVIDER_BLOCKLIST.has(extracted.toLowerCase())) {
        return { merchantName: extracted, extractedFrom: "counterparty" };
      }
    }

  }

  // 3. Stripe im Counterparty-Feld
  if (cpLower.includes("stripe")) {
    const stripeMatch = cp.match(/stripe\s*\*\s*([^,*]+)/i);
    if (stripeMatch && stripeMatch[1].trim().length > 1) {
      return { merchantName: stripeMatch[1].trim(), extractedFrom: "counterparty" };
    }
  }

  return { merchantName: null, extractedFrom: null };
}

/**
 * Erzeugt Trigramme für einen String.
 */
function getTrigrams(str: string): Set<string> {
  const padded = `  ${str.toLowerCase()} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Berechnet die Trigramm-Ähnlichkeit (Sørensen-Dice-Koeffizient auf Trigrammen) zwischen 0 und 1.
 */
export function calculateTrigramSimilarity(a: string, b: string): number {
  const normA = normalizeCounterparty(a);
  const normB = normalizeCounterparty(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const triA = getTrigrams(normA);
  const triB = getTrigrams(normB);

  let intersection = 0;
  for (const t of triA) {
    if (triB.has(t)) intersection += 1;
  }

  const total = triA.size + triB.size;
  if (total === 0) return 0;
  return (2 * intersection) / total;
}

/**
 * Berechnet Levenshtein-Distanz.
 */
export function calculateLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i += 1) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // replacement
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1,     // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Kombinierter Ähnlichkeitswert (0.0 bis 1.0) basierend auf Trigrammen und Levenshtein.
 */
export function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeCounterparty(a);
  const normB = normalizeCounterparty(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  // Substring Match Bonus: Wenn einer das exakte Wort des anderen enthält
  if (normA.includes(normB) || normB.includes(normA)) {
    const lenRatio = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
    if (lenRatio >= 0.5) return Math.max(0.88, lenRatio);
  }

  const trigram = calculateTrigramSimilarity(normA, normB);
  const levDist = calculateLevenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  const levSim = maxLen > 0 ? 1 - levDist / maxLen : 0;

  return 0.6 * trigram + 0.4 * levSim;
}
