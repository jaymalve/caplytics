import type { CaplyticsEvent } from "@caplytics/core";

/**
 * Returns `unknown` rather than `void | Promise<void>` so ordinary one-liners type-check —
 * `(event) => seen.push(event)` returns a number, and a union return type does not get TypeScript's
 * void-return leniency. Anything returned is ignored, except that a promise is watched so its
 * rejection can be reported rather than swallowed.
 */
export type CaplyticsEventHandler = (event: CaplyticsEvent) => unknown;

export type Unsubscribe = () => void;

export type EventBusOptions = {
  /** Called when a subscriber throws or rejects. Defaults to reporting on the console. */
  onHandlerError?: (error: Error, event: CaplyticsEvent) => void;
};

/**
 * Routes events to subscribers by budget key.
 *
 * Keyed by budget key rather than hung off the agent instance, per §3: attaching it to the agent
 * would force `attach()` to return `T & { caplytics: ... }`, breaking the same-`T` guarantee and
 * risking a collision with Mastra's own surface. It also lets an ops module subscribe without
 * importing the agent at all.
 */
export type EventBus = {
  on(budgetKey: string, handler: CaplyticsEventHandler): Unsubscribe;
  /** Routed by budget key explicitly, because the event records `agentId`, which may differ. */
  emit(budgetKey: string, event: CaplyticsEvent): void;
  listenerCount(budgetKey: string): number;
};

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const { onHandlerError = reportToConsole } = options;
  const handlers = new Map<string, Set<CaplyticsEventHandler>>();

  return {
    on(budgetKey, handler) {
      const existing = handlers.get(budgetKey) ?? new Set();
      existing.add(handler);
      handlers.set(budgetKey, existing);

      return () => {
        const current = handlers.get(budgetKey);
        if (current === undefined) return;

        current.delete(handler);
        // Dropping the empty set stops a long-lived process accumulating a key per finished run.
        if (current.size === 0) handlers.delete(budgetKey);
      };
    },

    emit(budgetKey, event) {
      const subscribers = handlers.get(budgetKey);
      if (subscribers === undefined) return;

      // Iterate a copy: a handler that unsubscribes itself — or subscribes another — must not
      // mutate the set being walked.
      for (const handler of [...subscribers]) {
        dispatch(handler, event, onHandlerError);
      }
    },

    listenerCount(budgetKey) {
      return handlers.get(budgetKey)?.size ?? 0;
    },
  };
}

/**
 * A subscriber's failure is contained here and never propagated.
 *
 * Enforcement reads the same event stream (§3), so letting a console logger's bug reach the caller
 * would take down spend control and the agent run with it. Async handlers are not awaited either:
 * a subscriber writing to a database must not add its latency to every model call.
 */
function dispatch(
  handler: CaplyticsEventHandler,
  event: CaplyticsEvent,
  onHandlerError: (error: Error, event: CaplyticsEvent) => void,
): void {
  try {
    const result = handler(event);
    if (result instanceof Promise) {
      result.catch((error: unknown) => onHandlerError(asError(error), event));
    }
  } catch (error) {
    onHandlerError(asError(error), event);
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function reportToConsole(error: Error, event: CaplyticsEvent): void {
  console.error(`[caplytics] event subscriber threw for ${event.agentId}: ${error.message}`);
}
