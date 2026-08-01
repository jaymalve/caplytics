// Pure entry: no database driver may be reachable from here. See
// architecture/core-subpath-exports.md — persistence lives at `@caplytics/core/postgres`.

export {
  type BudgetExceededDetails,
  CaplyticsBudgetExceededError,
} from "./budget/budget-exceeded-error.js";
export {
  type BudgetScope,
  type BudgetState,
  budgetRemaining,
  budgetSpent,
  budgetUsedFraction,
  scopeId,
} from "./budget/budget-state.js";
export type { BudgetStore, Reservation, ReserveOutcome } from "./budget/budget-store.js";
export {
  createInMemoryBudgetStore,
  type InMemoryBudgetStoreOptions,
} from "./budget/in-memory-budget-store.js";
export {
  decideLimit,
  isExhausted,
  type LimitAction,
  type LimitPolicy,
} from "./budget/limit-decision.js";
export {
  type CaplyticsEvent,
  type CaplyticsEventType,
  caplyticsEventSchema,
} from "./event/caplytics-event.js";
export { formatUsd } from "./money/format-usd.js";
export {
  MICRO_DOLLARS_PER_USD,
  type MicroDollars,
  microDollarsSchema,
  microDollarsToUsd,
  nonNegativeMicroDollarsSchema,
  subtractMicroDollars,
  sumMicroDollars,
  usdToMicroDollars,
  ZERO_MICRO_DOLLARS,
} from "./money/micro-dollars.js";
export { estimateTokenCount } from "./pricing/estimate-token-count.js";
export { type PriceTableSource, toPriceTable } from "./pricing/litellm-pricing.js";
export {
  type MicroDollarsPerMillionTokens,
  type ModelRates,
  microDollarsPerMillionTokensSchema,
  TOKENS_PER_MILLION,
  usdPerMillionTokens,
  usdPerTokenToRate,
} from "./pricing/model-rates.js";
export { type PricedCall, priceModelCall, priceUsage } from "./pricing/price-model-call.js";
export {
  EMPTY_PRICE_TABLE,
  findModelRates,
  modelIdCandidates,
  type PriceTable,
} from "./pricing/price-table.js";
export {
  type TokenUsage,
  tokenUsageSchema,
  totalInputTokens,
  ZERO_TOKEN_USAGE,
} from "./pricing/token-usage.js";
export { toolResultTokens } from "./pricing/tool-result-tokens.js";
