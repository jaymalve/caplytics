import type { ModelRates } from "./model-rates.js";

/**
 * Rates for every model a pricing feed knew about, with the moment they were retrieved.
 *
 * `fetchedAt` is not decoration: rates are only ever a snapshot of a moving target, and a caller
 * that cannot see how old they are cannot tell correct spend from confidently stale spend.
 */
export type PriceTable = {
  readonly fetchedAt: string;
  readonly source: string;
  readonly rates: ReadonlyMap<string, ModelRates>;
};

export const EMPTY_PRICE_TABLE: PriceTable = {
  fetchedAt: "1970-01-01T00:00:00.000Z",
  source: "none",
  rates: new Map(),
};

const DATED_SNAPSHOT_SUFFIX = /-\d{8}$/;
/** Bedrock publishes the same model under regional aliases that price identically. */
const REGION_PREFIX = /^(?:global|us|eu|au|jp|apac|ca|me)\./;

/**
 * Model ids to try, most specific first.
 *
 * Feeds key first-party models bare (`claude-sonnet-5`, `gpt-5`) while frameworks address them by
 * provider (`anthropic/claude-sonnet-5`), and the same model reappears under regional and dated
 * aliases. Rather than storing every spelling, the lookup peels one convention at a time.
 */
export function modelIdCandidates(modelId: string): string[] {
  const trimmed = modelId.trim();
  const lowered = trimmed.toLowerCase();
  const lastSegment = lowered.includes("/") ? (lowered.split("/").pop() ?? lowered) : lowered;
  const deregionalised = lastSegment.replace(REGION_PREFIX, "");

  const candidates = [
    trimmed,
    lowered,
    lastSegment,
    lastSegment.replace(DATED_SNAPSHOT_SUFFIX, ""),
    deregionalised,
    deregionalised.replace(DATED_SNAPSHOT_SUFFIX, ""),
  ];

  return [...new Set(candidates.filter((candidate) => candidate.length > 0))];
}

/**
 * Returns the rates for a model, or undefined when the table does not know it.
 *
 * Undefined is the signal for `priceUnknown` (§8.3): an unpriced call is reported as unpriced
 * rather than guessed at zero, which would make it indistinguishable from a free one.
 */
export function findModelRates(table: PriceTable, modelId: string): ModelRates | undefined {
  for (const candidate of modelIdCandidates(modelId)) {
    const rates = table.rates.get(candidate);
    if (rates !== undefined) return rates;
  }
  return undefined;
}
