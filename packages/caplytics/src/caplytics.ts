import {
  type BudgetStore,
  type CaplyticsEvent,
  createInMemoryBudgetStore,
  EMPTY_PRICE_TABLE,
  type PriceTable,
} from "@caplytics/core";
import type { AnyAgent, CaplyticsConfig } from "./adapters/mastra/agent-types.js";
import { attachWithRecording } from "./adapters/mastra/attach-with-recording.js";
import { createRequestContext } from "./adapters/mastra/call-metadata.js";
import { type AgentMonitor, createAgentMonitor } from "./events/agent-monitor.js";
import {
  type CaplyticsEventHandler,
  createEventBus,
  type EventBusOptions,
  type Unsubscribe,
} from "./events/event-bus.js";
import { createLiteLlmPriceSource } from "./pricing/litellm-price-source.js";
import type { PriceSource } from "./pricing/price-source.js";
import { newRunId, type RunContext, withRun } from "./run/run-context.js";

export type CaplyticsOptions = EventBusOptions & {
  store?: BudgetStore;
  priceSource?: PriceSource;
};

/**
 * The SDK's entry point: subscription lives here, not on agent instances (§3).
 *
 * There is no polling API and no required dashboard. Console warnings, hard-stop decisions,
 * degradation decisions, and any external dashboard all read this one stream.
 */
export type Caplytics = {
  /** Subscribe to a budget key. Returns an unsubscribe — a long-lived process needs one. */
  on(budgetKey: string, handler: CaplyticsEventHandler): Unsubscribe;

  /** A handle scoped to one budget key, for callers that hold onto it. */
  agent(budgetKey: string): AgentMonitor;

  /** @internal Publishes an event. Called by the interception points, not by users. */
  emit(budgetKey: string, event: CaplyticsEvent): void;

  /** @internal Introspection for tests and diagnostics. */
  listenerCount(budgetKey: string): number;

  /** Installs the interception points on an agent and returns it unchanged (§1). */
  attach<T extends AnyAgent>(agent: T, config?: CaplyticsConfig<T>): T;

  /**
   * Groups everything called inside into one run, so a per-run cap has something to bound.
   *
   * Needed because §1 allows no interception point that could bracket `.generate()` — see
   * adapters/mastra/run-identity.ts.
   */
  run<T>(fn: () => T, options?: { metadata?: Record<string, string> }): T;

  /**
   * A `requestContext` carrying per-call metadata and a run identity (§6.1).
   *
   * For callers who cannot wrap with `run()`, and the only way to attach metadata to one specific
   * call rather than to the agent.
   */
  context(metadata?: Record<string, string>): ReturnType<typeof createRequestContext>;

  /** Loads pricing. Awaited once before the first priced call so a run never starts unpriced. */
  warmPricing(): Promise<PriceTable>;
};

export function createCaplytics(options: CaplyticsOptions = {}): Caplytics {
  const bus = createEventBus(options);
  const store = options.store ?? createInMemoryBudgetStore();
  const priceSource = options.priceSource ?? createLiteLlmPriceSource();

  // Held synchronously because pricing sits in the hot path; `warmPricing()` populates it, and an
  // unpriced call reports priceUnknown rather than blocking the agent.
  let table: PriceTable = EMPTY_PRICE_TABLE;

  return {
    on: (budgetKey, handler) => bus.on(budgetKey, handler),
    agent: (budgetKey) => createAgentMonitor(bus, budgetKey),
    emit: (budgetKey, event) => {
      bus.emit(budgetKey, event);
    },
    listenerCount: (budgetKey) => bus.listenerCount(budgetKey),

    attach: (agent, config = {}) =>
      attachWithRecording(agent, config, {
        store,
        table: () => table,
        emit: (budgetKey, event) => bus.emit(budgetKey, event),
      }),

    run: (fn, runOptions = {}) => {
      const context: RunContext = {
        runId: newRunId(),
        budgetKey: "",
        metadata: runOptions.metadata ?? {},
        startedAt: new Date().toISOString(),
      };
      return withRun(context, fn);
    },

    context: (metadata = {}) => createRequestContext(metadata, newRunId()),

    warmPricing: async () => {
      table = await priceSource.load();
      return table;
    },
  };
}

/**
 * The shared instance §3's examples use.
 *
 * `createCaplytics()` exists alongside it so tests — and anyone embedding more than one isolated
 * setup in a process — do not have to share subscriber state.
 */
export const caplytics: Caplytics = createCaplytics();
