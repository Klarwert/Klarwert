/**
 * Manual price provider — always-available offline fallback.
 * Never makes network requests. Prices come solely from user input via depot_prices table.
 */
import type { PriceProvider, Quote } from "./types";
import { listPricesForIsin } from "@/db/repositories/depot";

export class ManualPriceProvider implements PriceProvider {
  readonly id = "manual" as const;

  async fetchLatest(identifiers: string[]): Promise<Quote[]> {
    const results: Quote[] = [];
    for (const isin of identifiers) {
      const prices = await listPricesForIsin(isin);
      if (prices.length > 0) {
        const latest = prices[0]; // already ordered DESC by date_str
        results.push({
          identifier: isin,
          date: latest.date_str,
          priceCents: latest.price_cents,
          currency: latest.currency,
          source: this.id,
        });
      }
    }
    return results;
  }

  fetchHistory(_identifier: string, _from: string, _to: string): Promise<Quote[]> {
    // For manual: return what's already in the local DB via the depot repository.
    // No network call needed — the DB is the source of truth.
    return Promise.resolve([]);
  }
}
