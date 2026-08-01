import { anthropicRates, type ModelRates } from "./model-rates.js";

type PricePeriod = {
  /** Inclusive ISO date this rate took effect; it applies until the next period begins. */
  from: string;
  rates: ModelRates;
};

const LAUNCH = "1970-01-01";

/**
 * Published list prices, newest period last.
 *
 * Rates are keyed by the bare model id. Provider prefixes (`anthropic/claude-sonnet-5`) and dated
 * snapshot suffixes (`claude-haiku-4-5-20251001`) are normalised away at lookup rather than
 * duplicated here, so a new alias does not need a new row.
 */
const RATES_BY_MODEL: Record<string, PricePeriod[]> = {
  "claude-fable-5": [{ from: LAUNCH, rates: anthropicRates(10, 50) }],
  "claude-mythos-5": [{ from: LAUNCH, rates: anthropicRates(10, 50) }],
  "claude-opus-4-8": [{ from: LAUNCH, rates: anthropicRates(5, 25) }],
  "claude-opus-4-7": [{ from: LAUNCH, rates: anthropicRates(5, 25) }],
  "claude-opus-4-6": [{ from: LAUNCH, rates: anthropicRates(5, 25) }],
  "claude-opus-4-5": [{ from: LAUNCH, rates: anthropicRates(5, 25) }],
  // Introductory pricing runs through 2026-08-31; list price takes over the next day.
  "claude-sonnet-5": [
    { from: LAUNCH, rates: anthropicRates(2, 10) },
    { from: "2026-09-01", rates: anthropicRates(3, 15) },
  ],
  "claude-sonnet-4-6": [{ from: LAUNCH, rates: anthropicRates(3, 15) }],
  "claude-sonnet-4-5": [{ from: LAUNCH, rates: anthropicRates(3, 15) }],
  "claude-haiku-4-5": [{ from: LAUNCH, rates: anthropicRates(1, 5) }],
};

const DATED_SNAPSHOT_SUFFIX = /-\d{8}$/;

export function normaliseModelId(modelId: string): string {
  const withoutProvider = modelId.includes("/") ? (modelId.split("/").pop() ?? modelId) : modelId;

  return withoutProvider.trim().toLowerCase().replace(DATED_SNAPSHOT_SUFFIX, "");
}

/**
 * Returns the rates in force at `at`, or undefined when the model is not in the registry.
 *
 * Undefined is the signal for `priceUnknown` (§8.3): an unpriced call is reported as unpriced
 * rather than guessed at zero, which would make it indistinguishable from a free one.
 */
export function findModelRates(modelId: string, at: string): ModelRates | undefined {
  const periods = RATES_BY_MODEL[normaliseModelId(modelId)];
  if (periods === undefined) return undefined;

  let applicable: ModelRates | undefined;
  for (const period of periods) {
    if (period.from <= at) applicable = period.rates;
  }
  return applicable;
}

export function pricedModelIds(): string[] {
  return Object.keys(RATES_BY_MODEL);
}
