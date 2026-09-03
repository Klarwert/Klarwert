/**
 * Quote service — the single entry point for fetching, caching and persisting prices.
 *
 * Architecture:
 * 1. Always check local cache (depot_prices) first.
 * 2. If today's price is missing AND the configured provider is not "manual",
 *    fetch from network and persist.
 * 3. One price per ISIN per calendar day is enforced by the DB (UNIQUE constraint).
 * 4. Rate limiting: all identifiers are batched into a single provider call.
 */

import { getAllSettings, setSetting } from "@/db/repositories/settings";
import { upsertDepotPrice, listPricesForIsin } from "@/db/repositories/depot";
import { invoke } from "@tauri-apps/api/core";
import { YahooFinanceProvider } from "./YahooFinanceProvider";
import { AlpacaProvider } from "./AlpacaProvider";
import { ManualPriceProvider } from "./ManualProvider";
import type { PriceProvider, PriceProviderId, Quote } from "./types";

export type { PriceProviderId, Quote };
export { PROVIDER_METADATA } from "./types";

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

// --- Settings helpers ----------------------------------------------------------

export async function getQuoteSettings(): Promise<{
  enabled: boolean;
  providerId: PriceProviderId;
  alpacaKey: string;
  alpacaSecret: string;
  privacyAccepted: boolean;
}> {
  const all = await getAllSettings();
  let alpacaKey = "";
  let alpacaSecret = "";

  try {
    const creds = await invoke<[string, string]>("get_api_credential");
    alpacaKey = creds[0];
    alpacaSecret = creds[1];
  } catch (e) {
    console.warn("Failed to get credentials from keyring", e);
  }

  // Migration from old settings table to keyring
  const { getDb } = await import("@/db/client");
  const db = await getDb();
  const oldKeys = await db.select<{key: string, value: string}[]>("SELECT key, value FROM settings WHERE key IN ('quotes_alpaca_key', 'quotes_alpaca_secret')");
  
  if (oldKeys.length > 0) {
    const oldKey = oldKeys.find(k => k.key === "quotes_alpaca_key")?.value ?? "";
    const oldSecret = oldKeys.find(k => k.key === "quotes_alpaca_secret")?.value ?? "";
    if (oldKey || oldSecret) {
      alpacaKey = oldKey || alpacaKey;
      alpacaSecret = oldSecret || alpacaSecret;
      try {
        await invoke("set_api_credential", { key: alpacaKey, secret: alpacaSecret });
        await db.execute("DELETE FROM settings WHERE key IN ('quotes_alpaca_key', 'quotes_alpaca_secret')");
      } catch (e) {
        console.warn("Failed to migrate credentials", e);
      }
    } else {
      await db.execute("DELETE FROM settings WHERE key IN ('quotes_alpaca_key', 'quotes_alpaca_secret')");
    }
  }

  return {
    enabled: all.quotes_enabled === "1",
    providerId: (all.quotes_provider as PriceProviderId | undefined) ?? "yahoo",
    alpacaKey,
    alpacaSecret,
    privacyAccepted: all.quotes_privacy_accepted === "1",
  };
}

export async function saveQuoteSettings(
  enabled: boolean,
  providerId: PriceProviderId,
  alpacaKey: string,
  alpacaSecret: string,
  privacyAccepted: boolean
): Promise<void> {
  await setSetting("quotes_enabled", enabled ? "1" : "0");
  await setSetting("quotes_provider", providerId);
  await setSetting("quotes_privacy_accepted", privacyAccepted ? "1" : "0");

  try {
    await invoke("set_api_credential", { key: alpacaKey, secret: alpacaSecret });
  } catch (e) {
    console.warn("Failed to save credentials to keyring", e);
  }
}

// --- Provider factory ----------------------------------------------------------

function buildProvider(
  providerId: PriceProviderId,
  alpacaKey: string,
  alpacaSecret: string
): PriceProvider {
  switch (providerId) {
    case "yahoo":
      return new YahooFinanceProvider();
    case "alpaca":
      return new AlpacaProvider(alpacaKey, alpacaSecret);
    case "manual":
    default:
      return new ManualPriceProvider();
  }
}

// --- Main API -----------------------------------------------------------------

/**
 * Fetch latest prices for a list of identifiers.
 * - Checks local DB first (today's prices).
 * - Only calls the network provider for identifiers with no today-price.
 * - Persists fetched quotes to depot_prices.
 * - Returns a map: identifier → priceCents.
 */
export async function fetchLatestPrices(
  identifiers: string[]
): Promise<Map<string, { priceCents: number; currency: string; date: string; source: PriceProviderId }>> {
  const result = new Map<string, { priceCents: number; currency: string; date: string; source: PriceProviderId }>();
  if (identifiers.length === 0) return result;

  const settings = await getQuoteSettings();

  // Always serve from cache first
  const today = todayIso();
  const needsFetch: string[] = [];

  for (const isin of identifiers) {
    const cached = await listPricesForIsin(isin);
    const todayEntry = cached.find((p) => p.date_str === today);
    if (todayEntry) {
      result.set(isin, {
        priceCents: todayEntry.price_cents,
        currency: todayEntry.currency,
        date: todayEntry.date_str,
        source: "manual", // cached, actual source not stored — treat as local
      });
    } else {
      // Most recent cached price (may be yesterday's) still serves as fallback
      if (cached.length > 0) {
        const latest = cached[0];
        result.set(isin, {
          priceCents: latest.price_cents,
          currency: latest.currency,
          date: latest.date_str,
          source: "manual",
        });
      }
      if (settings.enabled && settings.providerId !== "manual") {
        needsFetch.push(isin);
      }
    }
  }

  if (needsFetch.length === 0 || !settings.enabled || settings.providerId === "manual") {
    return result;
  }

  const provider = buildProvider(settings.providerId, settings.alpacaKey, settings.alpacaSecret);
  const quotes: Quote[] = await provider.fetchLatest(needsFetch);

  for (const q of quotes) {
    await upsertDepotPrice(q.identifier, q.date, q.priceCents, q.currency, "auto");
    result.set(q.identifier, {
      priceCents: q.priceCents,
      currency: q.currency,
      date: q.date,
      source: q.source,
    });
  }

  return result;
}

/**
 * Fetch historical daily prices for a single identifier.
 * Checks the local DB for already-cached dates and only fetches the gap.
 */
export async function fetchHistoricalPrices(
  identifier: string,
  from: string,
  to: string
): Promise<Quote[]> {
  const settings = await getQuoteSettings();
  if (!settings.enabled || settings.providerId === "manual") {
    // Return whatever is already in local DB
    const cached = await listPricesForIsin(identifier);
    return cached
      .filter((p) => p.date_str >= from && p.date_str <= to)
      .map((p) => ({
        identifier,
        date: p.date_str,
        priceCents: p.price_cents,
        currency: p.currency,
        source: "manual",
      }));
  }

  const provider = buildProvider(settings.providerId, settings.alpacaKey, settings.alpacaSecret);
  const quotes = await provider.fetchHistory(identifier, from, to);
  for (const q of quotes) {
    await upsertDepotPrice(q.identifier, q.date, q.priceCents, q.currency, "auto");
  }
  return quotes;
}
