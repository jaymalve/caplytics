import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Identity for one agent run, carried implicitly through everything it calls.
 *
 * Mastra's model resolver receives only `{ requestContext, mastra }` — no run id, no step, no
 * reference to the tool call that preceded it. Threading identity through the call stack is
 * therefore the only way to populate `CaplyticsEvent.runId` (§3), which makes this load-bearing
 * rather than a convenience.
 */
export type RunContext = {
  readonly runId: string;
  readonly budgetKey: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly startedAt: string;
};

/**
 * Deliberately not a module-level "current run" variable. Two runs in one process interleave at
 * every await, and a shared mutable slot would attribute one run's spend to the other — silently,
 * and only under concurrency.
 */
const storage = new AsyncLocalStorage<RunContext>();

export function withRun<T>(context: RunContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Undefined outside a run — a caller must decide whether that is an error or simply untracked. */
export function currentRun(): RunContext | undefined {
  return storage.getStore();
}

export function newRunId(): string {
  return `run_${crypto.randomUUID()}`;
}
