import { assertValidLadder } from "@caplytics/core";
import type { AnyAgent, CaplyticsConfig } from "./agent-types.js";

/**
 * Rejects a configuration that cannot do what it says, at attach time.
 *
 * Every check here is one that would otherwise fail silently at runtime — a cap that never trips, a
 * budget key that groups nothing, metadata that vanishes. A misconfiguration that surfaces on
 * startup is a fixed bug; one that surfaces as an unenforced budget is an invoice.
 */
export function validateConfig<T extends AnyAgent>(config: CaplyticsConfig<T>): void {
  validateCap(config.cap);
  validateBudgetKey(config.budget);
  validateTools(config.tools);
  validateMetadata(config.metadata);

  // §5.1's headroom rule; the ladder is only unworkable relative to whether the policy blocks.
  assertValidLadder(config.degrade ?? [], (config.onLimit ?? "warn") === "block");
}

function validateCap(cap: CaplyticsConfig<AnyAgent>["cap"]): void {
  if (cap === undefined || cap === "unlimited") return;

  if (!Number.isFinite(cap)) {
    throw new Error(
      `caplytics: cap must be a finite dollar amount, got ${cap}. Use cap: "unlimited" to opt out ` +
        "of spend control explicitly.",
    );
  }
  // A zero or negative cap blocks the first call, which is almost never what someone meant to
  // write — and under `warn` it would instead warn forever while spending freely.
  if (cap <= 0) {
    throw new Error(
      `caplytics: cap must be greater than zero, got ${cap}. Use cap: "unlimited" to opt out of ` +
        "spend control explicitly.",
    );
  }
}

function validateBudgetKey(budget: string | undefined): void {
  if (budget === undefined) return;

  if (budget.trim().length === 0) {
    throw new Error(
      "caplytics: budget must be a non-empty key. Omit it entirely to use the agent's id (§2.2).",
    );
  }
}

function validateTools(tools: CaplyticsConfig<AnyAgent>["tools"]): void {
  for (const [toolName, budget] of Object.entries(tools ?? {})) {
    if (budget === undefined) continue;

    if (!Number.isFinite(budget.cap) || budget.cap <= 0) {
      throw new Error(
        `caplytics: tool "${toolName}" has cap ${budget.cap}; a tool cap must be greater than zero.`,
      );
    }
    if (budget.cost !== undefined && (!Number.isFinite(budget.cost) || budget.cost < 0)) {
      throw new Error(
        `caplytics: tool "${toolName}" has cost ${budget.cost}; a declared cost may not be ` +
          "negative, and would otherwise credit the budget.",
      );
    }
  }
}

function validateMetadata(metadata: Record<string, string> | undefined): void {
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (key.trim().length === 0) {
      throw new Error("caplytics: metadata keys must be non-empty.");
    }
    // §6.1 is explicit that values are string-valued business data. A number here would survive
    // typing at a JS call site and then fail validation when the event is persisted.
    if (typeof value !== "string") {
      throw new Error(
        `caplytics: metadata."${key}" must be a string, got ${typeof value}. Metadata values are ` +
          "queried as strings (§6.1); convert before passing.",
      );
    }
  }
}
