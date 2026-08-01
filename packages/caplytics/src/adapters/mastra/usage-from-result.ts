import type { TokenUsage } from "@caplytics/core";
import { z } from "zod";

/**
 * Providers report `inputTokens` as a total that *includes* cached tokens, while the cost model
 * works in disjoint buckets. Subtracting here — at the boundary (§9.2) — is what stops cached
 * tokens being priced twice, once at the cache rate and once at the full input rate.
 */
const usageSchema = z.object({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  cachedInputTokens: z.number().nonnegative().optional(),
});

/** Cache *writes* are not in the AI SDK's usage shape; Anthropic reports them out of band. */
const providerMetadataSchema = z.object({
  anthropic: z.object({ cacheCreationInputTokens: z.number().nonnegative().optional() }).optional(),
});

export function usageFromResult(result: unknown): TokenUsage | undefined {
  if (typeof result !== "object" || result === null) return undefined;

  const usage = usageSchema.safeParse(Reflect.get(result, "usage"));
  if (!usage.success) return undefined;

  const metadata = providerMetadataSchema.safeParse(Reflect.get(result, "providerMetadata"));
  const cacheWriteInput = metadata.success
    ? (metadata.data.anthropic?.cacheCreationInputTokens ?? 0)
    : 0;

  const reportedInput = usage.data.inputTokens ?? 0;
  const cacheReadInput = usage.data.cachedInputTokens ?? 0;

  return {
    // Clamped: a provider reporting more cached tokens than total input would otherwise produce a
    // negative bucket and silently credit the budget.
    uncachedInput: Math.max(0, reportedInput - cacheReadInput - cacheWriteInput),
    cacheReadInput,
    cacheWriteInput,
    output: usage.data.outputTokens ?? 0,
    cacheWriteTtl: "5m",
  };
}
