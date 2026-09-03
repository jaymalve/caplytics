import type { CaplyticsEventHandler, EventBus, Unsubscribe } from "./event-bus.js";

/**
 * A subscription handle scoped to one budget key, per §3's `caplytics.agent("support-agent")`.
 *
 * Holds no reference to the agent instance — only its key — so a monitoring module can watch spend
 * without importing the agent definition.
 */
export type AgentMonitor = {
  readonly budgetKey: string;
  on(event: "call", handler: CaplyticsEventHandler): Unsubscribe;
};

export function createAgentMonitor(bus: EventBus, budgetKey: string): AgentMonitor {
  return {
    budgetKey,
    // "call" is the only event today. Naming it anyway keeps room for a second kind without
    // changing the shape users have already written against.
    on(_event, handler) {
      return bus.on(budgetKey, handler);
    },
  };
}
