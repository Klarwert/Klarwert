/**
 * Core types and interface for the price data abstraction layer (D3).
 *
 * Design principles:
 * - Standardmäßig deaktiviert – the user must explicitly opt in.
 * - Only ISIN/ticker symbols are ever sent to external providers, NEVER amounts or
 *   portfolio sizes. This is enforced at this layer by contract.
 * - One price per ISIN per day is cached locally in depot_prices.
 * - Rate limits and bundling are the responsibility of each provider.
 */

export type PriceProviderId = "yahoo" | "alpaca" | "manual";

export interface Quote {
  /** ISIN or ticker as requested */
  identifier: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Closing price in fractional EUR (or native currency) * 100 = cents. */
  priceCents: number;
  /** ISO 4217 currency code as returned by the provider */
  currency: string;
  /** Which provider returned this quote */
  source: PriceProviderId;
}

export interface PriceProviderConfig {
  id: PriceProviderId;
  label: string;
  description: string;
  requiresApiKey: boolean;
  apiKeyLabel?: string;
  privacyNote: string;
}

/**
 * The only contract that all price providers must fulfil.
 * Implementations must NOT include account sizes, portfolio values, or user data.
 */
export interface PriceProvider {
  readonly id: PriceProviderId;
  /**
   * Fetch latest closing prices for a list of identifiers (ISINs or tickers).
   * The provider should batch all requests. It must rate-limit itself.
   * Returns an empty array on network failure – never throws.
   */
  fetchLatest(identifiers: string[]): Promise<Quote[]>;
  /**
   * Fetch historical prices for a single identifier between two dates.
   * Dates are ISO strings YYYY-MM-DD, inclusive on both ends.
   */
  fetchHistory(identifier: string, from: string, to: string): Promise<Quote[]>;
}

export const PROVIDER_METADATA: Record<PriceProviderId, PriceProviderConfig> = {
  yahoo: {
    id: "yahoo",
    label: "Yahoo Finance",
    description:
      "Kostenlos, keine Registrierung. Nutzt den öffentlichen Yahoo Finance Datendienst " +
      "(dieselben Endpunkte wie das Open-Source yfinance Python-Paket).",
    requiresApiKey: false,
    privacyNote:
      "An Yahoo Finance werden ausschließlich Wertpapier-Kennungen (ISIN/Ticker) übertragen – " +
      "keine Stückzahlen, keine Kurswerte aus deinem Portfolio, keine Kontoverbindungen.",
  },
  alpaca: {
    id: "alpaca",
    label: "Alpaca Markets",
    description:
      "Echtzeit- und Historische Kursdaten. Erfordert einen kostenlosen Alpaca-Account " +
      "und API Key/Secret (BYOA – Bring Your Own Account).",
    requiresApiKey: true,
    apiKeyLabel: "Alpaca API Key & Secret",
    privacyNote:
      "An Alpaca Markets werden ausschließlich Ticker-Symbole übertragen – " +
      "keine Stückzahlen, keine Kontodaten. Alpaca speichert API-Nutzungsdaten gemäß ihrer Datenschutzerklärung.",
  },
  manual: {
    id: "manual",
    label: "Manuelle Eingabe",
    description: "Kein Netzwerkzugriff. Kurse werden ausschließlich manuell gepflegt.",
    requiresApiKey: false,
    privacyNote: "Kein Netzwerkzugriff. Keine Daten verlassen das Gerät.",
  },
};
