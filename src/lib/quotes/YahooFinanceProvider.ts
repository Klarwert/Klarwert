/**
 * Yahoo Finance price provider.
 *
 * Uses the same unofficial v8 JSON API endpoints that the yfinance Python library wraps.
 * Per yfinance's source: https://github.com/ranaroussi/yfinance
 *
 * Rate-limit: Yahoo silently throttles after ~2000 req/day from the same IP.
 * We batch all tickers into one request (chart endpoint supports a single ticker
 * but the v7/finance/quote supports a comma-separated list). We cache aggressively.
 *
 * Privacy: ONLY ticker symbols are sent. No account data, no amounts.
 *
 * Note: Yahoo has no official public API. These endpoints are stable but informal.
 * The app makes this clear in the privacy disclosure dialog before enabling.
 */

import type { PriceProvider, Quote } from "./types";

const BASE = "https://query2.finance.yahoo.com";

interface YahooQuoteResponse {
  quoteResponse: {
    result: Array<{
      symbol: string;
      regularMarketPrice: number;
      currency: string;
      regularMarketTime: number;
    }>;
    error: unknown;
  };
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: { currency: string; symbol: string };
      timestamp: number[];
      indicators: {
        adjclose: Array<{ adjclose: number[] }>;
      };
    }>;
    error: unknown;
  };
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

export class YahooFinanceProvider implements PriceProvider {
  readonly id = "yahoo" as const;

  async fetchLatest(identifiers: string[]): Promise<Quote[]> {
    if (identifiers.length === 0) return [];
    try {
      // Use the v7/finance/quote endpoint that accepts multiple symbols at once
      const symbols = identifiers.join(",");
      const url = `${BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,currency,regularMarketTime`;
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        cache: "no-cache",
      });
      if (!res.ok) {
        console.warn(`[YahooFinance] HTTP ${res.status} for latest quotes`);
        return [];
      }
      const data = (await res.json()) as YahooQuoteResponse;
      const today = todayIso();
      return (data.quoteResponse.result ?? []).map((r) => ({
        identifier: r.symbol,
        date: today,
        priceCents: Math.round(r.regularMarketPrice * 100),
        currency: r.currency ?? "USD",
        source: this.id,
      }));
    } catch (e) {
      console.warn("[YahooFinance] fetchLatest failed:", e);
      return [];
    }
  }

  async fetchHistory(identifier: string, from: string, to: string): Promise<Quote[]> {
    try {
      const period1 = Math.floor(new Date(from).getTime() / 1000);
      const period2 = Math.floor(new Date(to).getTime() / 1000) + 86400;
      const url = `${BASE}/v8/finance/chart/${encodeURIComponent(identifier)}?period1=${period1}&period2=${period2}&interval=1d&events=adjdivision`;
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        cache: "no-cache",
      });
      if (!res.ok) {
        console.warn(`[YahooFinance] HTTP ${res.status} for ${identifier} history`);
        return [];
      }
      const data = (await res.json()) as YahooChartResponse;
      const chartResult = data.chart?.result?.[0];
      if (!chartResult) return [];

      const { timestamp, indicators, meta } = chartResult;
      const adjCloses = indicators.adjclose?.[0]?.adjclose ?? [];
      const currency = meta.currency ?? "USD";
      const quotes: Quote[] = [];
      for (let i = 0; i < timestamp.length; i++) {
        const price = adjCloses[i];
        if (price == null || isNaN(price)) continue;
        quotes.push({
          identifier,
          date: unixToIso(timestamp[i]),
          priceCents: Math.round(price * 100),
          currency,
          source: this.id,
        });
      }
      return quotes;
    } catch (e) {
      console.warn(`[YahooFinance] fetchHistory ${identifier} failed:`, e);
      return [];
    }
  }
}
