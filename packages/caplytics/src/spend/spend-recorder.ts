import {
  type BudgetScope,
  type BudgetStore,
  budgetRemaining,
  type CaplyticsEvent,
  findModelRates,
  type MicroDollars,
  type PriceTable,
  priceModelCall,
  type TokenUsage,
  toolResultTokens,
  usdToMicroDollars,
  ZERO_MICRO_DOLLARS,
} from "@caplytics/core";

export type RecordedCall = {
  readonly runId: string;
  readonly agentId: string;
  readonly budgetKey: string;
  readonly cap: MicroDollars | null;
  readonly metadata: Readonly<Record<string, string>>;
};

export type SpendRecorderDeps = {
  readonly store: BudgetStore;
  readonly table: () => PriceTable;
  readonly emit: (budgetKey: string, event: CaplyticsEvent) => void;
};

/**
 * Turns one intercepted call into one event (§3), and into the ledger entry behind it.
 *
 * Records only. Whether a breach warns, blocks, or degrades is §4/§5 policy and layers on top of
 * the same numbers.
 */
export function createSpendRecorder(deps: SpendRecorderDeps) {
  return {
    modelCall(call: RecordedCall, modelId: string, usage: TokenUsage): void {
      const rates = findModelRates(deps.table(), modelId);
      const priced = priceModelCall(rates, usage);

      deps.emit(
        call.budgetKey,
        buildEvent(deps.store, call, {
          type: "model_call",
          name: modelId,
          cost: priced.cost,
          priceUnknown: priced.priceUnknown,
          tokensIn: usage.uncachedInput + usage.cacheReadInput + usage.cacheWriteInput,
          tokensOut: usage.output,
        }),
      );
    },

    /**
     * A tool consumes budget only for cost nothing can observe — a paid API, a payment moved.
     *
     * Its result's tokens are reported on `tokensIn` for attribution but never charged: the
     * provider bills them as input on the *following* model call, which is already priced in full.
     * See architecture/tool-cost-derivation.md.
     */
    toolCall(call: RecordedCall, toolName: string, result: unknown, declaredCost?: number): void {
      const cost =
        declaredCost === undefined ? ZERO_MICRO_DOLLARS : usdToMicroDollars(declaredCost);

      deps.emit(
        call.budgetKey,
        buildEvent(deps.store, call, {
          type: "tool_call",
          name: toolName,
          cost,
          priceUnknown: false,
          tokensIn: toolResultTokens(result),
        }),
      );
    },
  };
}

type EventFacts = {
  type: CaplyticsEvent["type"];
  name: string;
  cost: MicroDollars;
  priceUnknown: boolean;
  tokensIn?: number | undefined;
  tokensOut?: number | undefined;
};

function buildEvent(store: BudgetStore, call: RecordedCall, facts: EventFacts): CaplyticsEvent {
  const scope: BudgetScope = { runId: call.runId, budgetKey: call.budgetKey };
  store.open(scope, call.cap);

  // Reserve and settle for the same amount: cost is only knowable after the call, so there was
  // never an estimate to correct. The pair still routes every charge through one accounting path.
  const { reservation } = store.reserve(scope, facts.cost);
  const state = store.settle(reservation.id, facts.cost);

  return {
    id: crypto.randomUUID(),
    runId: call.runId,
    agentId: call.agentId,
    type: facts.type,
    name: facts.name,
    costEstimate: facts.cost,
    costActual: facts.cost,
    priceUnknown: facts.priceUnknown,
    ...(facts.tokensIn === undefined ? {} : { tokensIn: facts.tokensIn }),
    ...(facts.tokensOut === undefined ? {} : { tokensOut: facts.tokensOut }),
    budgetRemaining: budgetRemaining(state),
    timestamp: new Date().toISOString(),
    metadata: { ...call.metadata },
  };
}
