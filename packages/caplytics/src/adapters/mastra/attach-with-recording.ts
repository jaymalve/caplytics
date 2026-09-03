import {
  type BudgetStore,
  type CaplyticsEvent,
  type MicroDollars,
  type PriceTable,
  usdToMicroDollars,
} from "@caplytics/core";
import { createSpendRecorder, type RecordedCall } from "../../spend/spend-recorder.js";
import type { AnyAgent, CaplyticsConfig } from "./agent-types.js";
import { attach, budgetKeyFor } from "./attach.js";
import { resolveRun } from "./run-identity.js";
import { usageFromResult } from "./usage-from-result.js";

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
  const recorder = createSpendRecorder(deps);
  const budgetKey = budgetKeyFor(agent, config);
  const cap = resolveCap(config.cap);
  const agentId = String(agent.id);

  // The model resolver runs before the call and the result hook after it, so the run resolved at
  // the start is carried forward rather than resolved twice — a second resolution could land in a
  // different async context and split one call across two runs.
  let pending: RecordedCall | undefined;

  return attach(agent, config, {
    onModelCall: ({ scope }) => {
      pending = {
        runId: resolveRun(scope.requestContext).runId,
        agentId,
        budgetKey,
        cap,
        metadata: { ...config.metadata },
      };
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
    onToolResult: ({ scope, toolName, result }) => {
      const declared = config.tools?.[toolName as keyof typeof config.tools]?.cost;

      recorder.toolCall(
        {
          runId: resolveRun(scope.requestContext).runId,
          agentId,
          budgetKey,
          cap,
          metadata: { ...config.metadata },
        },
        toolName,
        result,
        declared,
      );
    },
  });
}

function resolveCap(cap: CaplyticsConfig<AnyAgent>["cap"]): MicroDollars | null {
  if (cap === "unlimited") return null;
  return usdToMicroDollars(cap ?? DEFAULT_CAP_USD);
}
