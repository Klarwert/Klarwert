/**
 * Alpaca Markets price provider (BYOA – Bring Your Own Account).
 *
 * Free tier: https://alpaca.markets/data
 * Supports stocks, ETFs. No crypto in free tier.
 * Uses the Alpaca Data API v2.
 *
 * Requires: ALPACA_API_KEY + ALPACA_API_SECRET (stored locally in plain text in app settings).
 * WARNING: These secrets are currently stored unencrypted. High risk of exposure via JSON exports, backups, or logs.
 * Privacy: Only ticker symbols are sent. No amounts, no portfolio data.
 */

import type { PriceProvider, Quote } from "./types";

const BASE = "https://data.alpaca.markets/v2";

interface AlpacaBar {
  t: string; // RFC3339 timestamp
  c: number; // close price
}

interface AlpacaLatestBarsResponse {
  bars: Record<string, AlpacaBar>;
}

interface AlpacaHistoricalBarsResponse {
  bars: AlpacaBar[];
  next_page_token?: string;
}

export class AlpacaProvider implements PriceProvider {
  readonly id = "alpaca" as const;

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string
  ) {}

  private get headers(): Record<string, string> {
    return {
      "Accept": "application/json",
      "APCA-API-KEY-ID": this.apiKey,
      "APCA-API-SECRET-KEY": this.apiSecret,
    };
  }

  async fetchLatest(identifiers: string[]): Promise<Quote[]> {
    if (identifiers.length === 0) return [];
    if (!this.apiKey || !this.apiSecret) return [];
    try {
      const symbols = identifiers.join(",");
      const url = `${BASE}/stocks/bars/latest?symbols=${encodeURIComponent(symbols)}&feed=iex`;
      const res = await fetch(url, { headers: this.headers, cache: "no-cache" });
      if (!res.ok) {
        console.warn(`[Alpaca] HTTP ${res.status} for latest bars`);
        return [];
      }
      const data = (await res.json()) as AlpacaLatestBarsResponse;
      return Object.entries(data.bars).map(([symbol, bar]) => ({
        identifier: symbol,
        date: bar.t.split("T")[0],
        priceCents: Math.round(bar.c * 100),
        currency: "USD", // Alpaca data is USD for US markets
        source: this.id,
      }));
    } catch (e) {
      console.warn("[Alpaca] fetchLatest failed:", e);
      return [];
    }
  }

  async fetchHistory(identifier: string, from: string, to: string): Promise<Quote[]> {
    if (!this.apiKey || !this.apiSecret) return [];
    try {
      const quotes: Quote[] = [];
      let pageToken: string | undefined;

      do {
        const params = new URLSearchParams({
          start: `${from}T00:00:00Z`,
          end: `${to}T23:59:59Z`,
          timeframe: "1Day",
          feed: "iex",
          limit: "1000",
          ...(pageToken ? { page_token: pageToken } : {}),
        });
        const url = `${BASE}/stocks/${encodeURIComponent(identifier)}/bars?${params.toString()}`;
        const res = await fetch(url, { headers: this.headers, cache: "no-cache" });
        if (!res.ok) {
          console.warn(`[Alpaca] HTTP ${res.status} for ${identifier} history`);
          break;
        }
        const data = (await res.json()) as AlpacaHistoricalBarsResponse;
        for (const bar of data.bars ?? []) {
          quotes.push({
            identifier,
            date: bar.t.split("T")[0],
            priceCents: Math.round(bar.c * 100),
            currency: "USD",
            source: this.id,
          });
        }
        pageToken = data.next_page_token;
      } while (pageToken);

      return quotes;
    } catch (e) {
      console.warn(`[Alpaca] fetchHistory ${identifier} failed:`, e);
      return [];
    }
  }
}
