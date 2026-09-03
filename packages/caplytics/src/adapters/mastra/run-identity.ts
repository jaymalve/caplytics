import { currentRun, newRunId } from "../../run/run-context.js";

export const RUN_ID_CONTEXT_KEY = "caplytics.runId";

export type ResolvedRun = {
  readonly runId: string;
  /**
   * False when no run could be identified and each call therefore stands alone. A per-run cap
   * cannot be enforced in that state, and the caller must not pretend otherwise.
   */
  readonly scoped: boolean;
};

/**
 * Recovers which run a model call belongs to.
 *
 * §1 allows only two interception points and neither can bracket `.generate()`, so run identity has
 * to come from something the caller supplies. Verified against `@mastra/core@1.55.0`: the
 * `RequestContext` instance is rebuilt for every model call, so its identity is useless — but
 * entries the caller set on it do survive into each call, and `AsyncLocalStorage` established
 * around `.generate()` also reaches the resolver.
 *
 * Ladder, most explicit first. The fallback tracks cost and still emits events; it only gives up on
 * grouping them, and says so out loud rather than quietly handing every call a fresh allowance.
 */
export function resolveRun(requestContext: unknown, warn: () => void = warnOnce): ResolvedRun {
  const fromStorage = currentRun();
  if (fromStorage !== undefined) return { runId: fromStorage.runId, scoped: true };

  const fromContext = readRunId(requestContext);
  if (fromContext !== undefined) return { runId: fromContext, scoped: true };

  warn();
  return { runId: newRunId(), scoped: false };
}

function readRunId(requestContext: unknown): string | undefined {
  if (typeof requestContext !== "object" || requestContext === null) return undefined;

  const get = Reflect.get(requestContext, "get");
  if (typeof get !== "function") return undefined;

  const value: unknown = get.call(requestContext, RUN_ID_CONTEXT_KEY);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

let warned = false;

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[caplytics] could not identify the run for this call, so each call is being counted on its " +
      "own and per-run caps are NOT being enforced. Wrap calls in caplytics.run(() => " +
      "agent.generate(...)), or pass requestContext: caplytics.context(...).",
  );
}

/** @internal Test seam — the warning is once per process by design. */
export function resetRunIdentityWarning(): void {
  warned = false;
}
