import { z } from "zod";

/**
 * Token counts for one model call, in non-overlapping buckets.
 *
 * Providers disagree on whether their "input tokens" figure includes cached tokens or excludes
 * them — the Anthropic API reports the uncached remainder, others report a total. Narrowing to
 * disjoint buckets at this boundary (§9.2) makes double-counting impossible downstream, and makes
 * the adapter state which convention it is translating from.
 */
export const tokenUsageSchema = z.object({
  /** Input tokens billed at the full rate: neither read from nor written to the prompt cache. */
  uncachedInput: z.int().nonnegative(),
  /** Cache hits, billed at a fraction of the input rate. */
  cacheReadInput: z.int().nonnegative(),
  /** Tokens written into the cache, billed at a premium over the input rate. */
  cacheWriteInput: z.int().nonnegative(),
  output: z.int().nonnegative(),
  /** Cache writes are priced by how long the entry lives; providers do not report which was used. */
  cacheWriteTtl: z.enum(["5m", "1h"]).default("5m"),
});

export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const ZERO_TOKEN_USAGE: TokenUsage = {
  uncachedInput: 0,
  cacheReadInput: 0,
  cacheWriteInput: 0,
  output: 0,
  cacheWriteTtl: "5m",
};

export function totalInputTokens(usage: TokenUsage): number {
  return usage.uncachedInput + usage.cacheReadInput + usage.cacheWriteInput;
}
