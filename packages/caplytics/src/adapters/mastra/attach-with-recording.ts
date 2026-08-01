import {
  type BudgetScope,
  type BudgetStore,
  budgetSpent,
  budgetUsedFraction,
  CaplyticsBudgetExceededError,
  type CaplyticsEvent,
  decideLimit,
  findModelRates,
  formatUsd,
  type LimitPolicy,
  type MicroDollars,
  type PriceTable,
  priceModelCall,
  resolveRung,
  usdToMicroDollars,
  ZERO_TOKEN_USAGE,
} from "@caplytics/core";
import { ModelRouterLanguageModel } from "@mastra/core/llm";
import type { CallSelection } from "../../model/proxy-language-model.js";
import { currentRun } from "../../run/run-context.js";
import { createSpendRecorder, type RecordedCall } from "../../spend/spend-recorder.js";
import type { AnyAgent, CaplyticsConfig } from "./agent-types.js";
import { attach, budgetKeyFor } from "./attach.js";
import { mergeMetadata, readCallMetadata } from "./call-metadata.js";
import { resolveRun } from "./run-identity.js";
import { usageFromResult } from "./usage-from-result.js";
import { validateConfig } from "./validate-config.js";

/** §10 item 4: zero-config must still enforce something, and warn rather than kill a first run. */
export const DEFAULT_CAP_USD = 1;

export type RecordingDeps = {
  readonly store: BudgetStore;
  readonly table: () => PriceTable;
  readonly emit: (budgetKey: string, event: CaplyticsEvent) => void;
};

/**
 * Attaches the interception points and records what passes through them.
 *
 * Run identity is resolved per call rather than bracketed, because §1 permits no interception point
 * that could bracket one — see run-identity.ts.
 */
export function attachWithRecording<T extends AnyAgent>(
  agent: T,
  config: CaplyticsConfig<T>,
  deps: RecordingDeps,
): T {
  // Everything checked here would otherwise fail silently at runtime (§5.1 among them).
  validateConfig(config);

  const recorder = createSpendRecorder(deps);
  const budgetKey = budgetKeyFor(agent, config);
  const cap = resolveCap(config.cap);
  const agentId = String(agent.id);

  // The model resolver runs before the call and the result hook after it, so the run resolved at
  // the start is carried forward rather than resolved twice — a second resolution could land in a
  // different async context and split one call across two runs.
  let pending: RecordedCall | undefined;
  let pendingTool: RecordedCall | undefined;

  const policy: LimitPolicy = config.onLimit ?? "warn";
  const ladder = config.degrade ?? [];
  const warnedRuns = new Set<string>();

  // Substitute models are built once and reused; constructing a router per call would pay setup
  // costs on exactly the calls the ladder is trying to make cheaper.
  const substitutes = new Map<string, object>();
  function substituteFor(modelId: string): object {
    const existing = substitutes.get(modelId);
    if (existing !== undefined) return existing;

    const built = new ModelRouterLanguageModel(modelId as never);
    substitutes.set(modelId, built);
    return built;
  }

  /**
   * §4.2's mid-stream stop.
   *
   * A single long `.stream()` call can cross the cap without ever reaching a call boundary, which
   * is where §4.1's check lives. This projects the cost of what has streamed so far and stops once
   * it would take the run past its cap.
   *
   * Only under `block`: a soft policy must not kill a stream in flight.
   */
  function streamProgress(
    requestContext: unknown,
    modelId: string,
    estimatedOutputTokens: number,
  ): "continue" | "abort" {
    if (policy !== "block" || cap === null) return "continue";

    const rates = findModelRates(deps.table(), modelId);
    if (rates === undefined) return "continue";

    const runId = resolveRun(requestContext).runId;
    const state = deps.store.open({ runId, budgetKey }, cap);

    const projected = priceModelCall(rates, {
      ...ZERO_TOKEN_USAGE,
      output: estimatedOutputTokens,
    });
    const wouldSpend = Number(budgetSpent(state)) + Number(projected.cost);

    return wouldSpend > Number(cap) ? "abort" : "continue";
  }

  /** §5, evaluated per model call — the proxy is the only seam that sees each one. */
  function selectForCall(requestContext: unknown): CallSelection | undefined {
    if (ladder.length === 0) return undefined;

    const runId = resolveRun(requestContext).runId;
    const state = deps.store.open({ runId, budgetKey }, cap);
    const rung = resolveRung(budgetUsedFraction(state), ladder);
    if (rung === undefined) return undefined;

    return "model" in rung
      ? { model: substituteFor(rung.model) }
      : { maxOutputTokens: rung.maxTokens };
  }

  /**
   * The §4.1 check, run before the call fires.
   *
   * Throwing from a start hook aborts the call: both hooks are invoked outside the wrapper's
   * try/catch, so the error propagates out of `doGenerate` / `execute` as an ordinary failure and
   * Mastra's loop needs no special handling.
   */
  function enforceBefore(requestContext: unknown): RecordedCall {
    const call: RecordedCall = {
      runId: resolveRun(requestContext).runId,
      agentId,
      budgetKey,
      cap,
      metadata: mergeMetadata(
        config.metadata,
        currentRun()?.metadata,
        readCallMetadata(requestContext),
      ),
    };

    const scope: BudgetScope = { runId: call.runId, budgetKey };
    const state = deps.store.open(scope, cap);
    const action = decideLimit(state, policy);

    if (action === "block") {
      throw new CaplyticsBudgetExceededError({
        runId: call.runId,
        budget: budgetKey,
        spent: budgetSpent(state),
        // `cap` is non-null here: decideLimit only blocks a capped run.
        cap: state.cap ?? cap ?? budgetSpent(state),
      });
    }

    // Once per run, not once per call: a run that keeps going past its cap would otherwise emit a
    // warning for every remaining call and bury the one that mattered.
    if (action === "warn" && !warnedRuns.has(call.runId)) {
      warnedRuns.add(call.runId);
      console.warn(
        `[caplytics] budget "${budgetKey}" exhausted — spent ${formatUsd(budgetSpent(state))} ` +
          `of ${formatUsd(state.cap ?? budgetSpent(state))} (run ${call.runId}). ` +
          'Calls continue because onLimit is "warn"; set onLimit: "block" to stop them.',
      );
    }

    return call;
  }

  return attach(agent, config, {
    selectForCall: ({ scope }) => selectForCall(scope.requestContext),
    onStreamProgress: ({ scope, modelId, estimatedOutputTokens }) =>
      streamProgress(scope.requestContext, modelId, estimatedOutputTokens),
    onModelCall: ({ scope }) => {
      pending = enforceBefore(scope.requestContext);
    },
    onModelResult: ({ modelId, result }) => {
      const usage = usageFromResult(result);
      const call = pending;
      pending = undefined;
      // No usage means the provider reported nothing to price; recording a zero-cost call would
      // claim the call was free rather than unmeasured.
      if (call === undefined || usage === undefined) return;

      recorder.modelCall(call, modelId, usage);
    },
    onToolCall: ({ scope }) => {
      pendingTool = enforceBefore(scope.requestContext);
    },
    onToolResult: ({ toolName, result }) => {
      const declared = config.tools?.[toolName as keyof typeof config.tools]?.cost;
      const call = pendingTool;
      pendingTool = undefined;
      if (call === undefined) return;

      recorder.toolCall(call, toolName, result, declared);
    },
  });
}

function resolveCap(cap: CaplyticsConfig<AnyAgent>["cap"]): MicroDollars | null {
  if (cap === "unlimited") return null;
  return usdToMicroDollars(cap ?? DEFAULT_CAP_USD);
}
