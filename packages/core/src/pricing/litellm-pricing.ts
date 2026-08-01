import { z } from "zod";
import { type ModelRates, usdPerTokenToRate } from "./model-rates.js";
import type { PriceTable } from "./price-table.js";

/**
 * Parses LiteLLM's `model_prices_and_context_window.json` into a price table.
 *
 * The feed is community-maintained (BerriAI/LiteLLM, MIT) and publishes cache read and cache write
 * costs per model explicitly, including the longer-TTL write tier — so no vendor cache multipliers
 * are hardcoded here or anywhere else.
 *
 * This module is pure: it validates and converts, and never fetches. Retrieval is the SDK's job,
 * which keeps the boundary narrowing (§9.2) independently testable against fixtures.
 */
const litellmEntrySchema = z.object({
  mode: z.string().optional(),
  input_cost_per_token: z.number().nonnegative().optional(),
  output_cost_per_token: z.number().nonnegative().optional(),
  cache_read_input_token_cost: z.number().nonnegative().optional(),
  cache_creation_input_token_cost: z.number().nonnegative().optional(),
  cache_creation_input_token_cost_above_1hr: z.number().nonnegative().optional(),
});

const litellmFeedSchema = z.record(z.string(), z.unknown());

export type PriceTableSource = {
  fetchedAt: string;
  source: string;
};

/**
 * Entries are skipped rather than rejected when malformed.
 *
 * The feed carries thousands of models across every provider, including embedding, image, and
 * rerank entries with no chat pricing at all. One unparseable row must not cost the caller every
 * other model's price — a skipped model degrades to `priceUnknown`, which is already a handled
 * state, whereas a thrown error leaves the whole run unpriced.
 */
export function toPriceTable(feed: unknown, meta: PriceTableSource): PriceTable {
  const parsedFeed = litellmFeedSchema.safeParse(feed);
  if (!parsedFeed.success) {
    throw new Error("pricing feed is not an object keyed by model id");
  }

  const rates = new Map<string, ModelRates>();
  for (const [modelId, rawEntry] of Object.entries(parsedFeed.data)) {
    const entry = litellmEntrySchema.safeParse(rawEntry);
    if (!entry.success) continue;

    const modelRates = toModelRates(entry.data);
    if (modelRates !== undefined) rates.set(modelId.toLowerCase(), modelRates);
  }

  return { fetchedAt: meta.fetchedAt, source: meta.source, rates };
}

type LiteLlmEntry = z.infer<typeof litellmEntrySchema>;

function toModelRates(entry: LiteLlmEntry): ModelRates | undefined {
  if (entry.mode !== "chat") return undefined;

  const input = entry.input_cost_per_token;
  const output = entry.output_cost_per_token;
  if (input === undefined && output === undefined) return undefined;

  const inputPerToken = input ?? 0;

  // A model without published cache pricing falls back to its uncached input rate. Assuming the
  // discount a model may not offer would under-report spend; assuming no discount cannot, and a
  // model that does not support caching reports zero cached tokens anyway.
  const cacheWrite5m = entry.cache_creation_input_token_cost ?? inputPerToken;

  return {
    uncachedInput: usdPerTokenToRate(inputPerToken),
    output: usdPerTokenToRate(output ?? 0),
    cacheReadInput: usdPerTokenToRate(entry.cache_read_input_token_cost ?? inputPerToken),
    cacheWrite5mInput: usdPerTokenToRate(cacheWrite5m),
    cacheWrite1hInput: usdPerTokenToRate(
      entry.cache_creation_input_token_cost_above_1hr ?? cacheWrite5m,
    ),
  };
}
