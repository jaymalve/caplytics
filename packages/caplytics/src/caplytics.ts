import type { CaplyticsEvent } from "@caplytics/core";
import { type AgentMonitor, createAgentMonitor } from "./events/agent-monitor.js";
import {
  type CaplyticsEventHandler,
  createEventBus,
  type EventBusOptions,
  type Unsubscribe,
} from "./events/event-bus.js";

export type CaplyticsOptions = EventBusOptions;

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
};

export function createCaplytics(options: CaplyticsOptions = {}): Caplytics {
  const bus = createEventBus(options);

  return {
    on: (budgetKey, handler) => bus.on(budgetKey, handler),
    agent: (budgetKey) => createAgentMonitor(bus, budgetKey),
    emit: (budgetKey, event) => {
      bus.emit(budgetKey, event);
    },
    listenerCount: (budgetKey) => bus.listenerCount(budgetKey),
  };
}

/**
 * The shared instance §3's examples use.
 *
 * `createCaplytics()` exists alongside it so tests — and anyone embedding more than one isolated
 * setup in a process — do not have to share subscriber state.
 */
export const caplytics: Caplytics = createCaplytics();
