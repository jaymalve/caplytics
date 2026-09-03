import { EMPTY_PRICE_TABLE, type PriceTable, toPriceTable } from "@caplytics/core";
import type { PriceSource } from "./price-source.js";

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10_000;

export type LiteLlmPriceSourceOptions = {
  url?: string;
  /** How long a fetched table is reused before the next load refreshes it. */
  ttlMs?: number;
  timeoutMs?: number;
  /** Called when a refresh fails. Defaults to one warning per process. */
  onError?: (error: Error) => void;
  fetchImpl?: typeof fetch;
};

/**
 * Fetches model pricing from LiteLLM's published feed and caches it in memory.
 *
 * Prices are read from the feed rather than compiled into this package: rates change and models
 * ship continuously, so a table baked into a release is wrong from the day it is cut and stays
 * wrong until someone upgrades.
 *
 * The trade is that pricing now depends on reachability. A failed refresh keeps serving the last
 * good table; a failure with nothing cached leaves every call `priceUnknown`, which the caller must
 * treat as unenforced spend rather than free spend.
 */
export function createLiteLlmPriceSource(options: LiteLlmPriceSourceOptions = {}): PriceSource {
  const {
    url = LITELLM_PRICING_URL,
    ttlMs = DEFAULT_TTL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onError = warnOnce(),
    fetchImpl = fetch,
  } = options;

  let cached: PriceTable | undefined;
  let cachedAt = 0;
  // Concurrent first calls share one request instead of each opening their own.
  let inFlight: Promise<PriceTable> | undefined;

  async function refresh(): Promise<PriceTable> {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        throw new Error(`pricing feed responded ${response.status}`);
      }

      const table = toPriceTable(await response.json(), {
        fetchedAt: new Date().toISOString(),
        source: url,
      });
      if (table.rates.size === 0) {
        throw new Error("pricing feed contained no priced chat models");
      }

      cached = table;
      cachedAt = Date.now();
      return table;
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      // Stale rates beat no rates: without them every call reports priceUnknown and stops
      // contributing to any budget, which silently disables enforcement.
      return cached ?? EMPTY_PRICE_TABLE;
    } finally {
      inFlight = undefined;
    }
  }

  return {
    load() {
      if (cached !== undefined && Date.now() - cachedAt < ttlMs) {
        return Promise.resolve(cached);
      }
      inFlight ??= refresh();
      return inFlight;
    },
  };
}

function warnOnce(): (error: Error) => void {
  let warned = false;
  return (error) => {
    if (warned) return;
    warned = true;
    console.warn(
      `[caplytics] could not load model pricing (${error.message}). ` +
        "Calls will be recorded with priceUnknown and will not count against budgets.",
    );
  };
}
