import { estimateTokenCount } from "./estimate-token-count.js";

/**
 * Tokens a tool's result will add to the parent model's next turn.
 *
 * Reported for attribution, never charged to a budget. The provider bills these tokens as input on
 * the *following* model call, which caplytics already prices in full — charging them here as well
 * would count the same tokens twice and make the ledger disagree with the invoice. A chatty tool is
 * still caught, because its payload inflates the model call that reads it.
 *
 * Undefined when the result will not serialise, which is reported rather than guessed at zero.
 */
export function toolResultTokens(result: unknown): number | undefined {
  try {
    const serialised = JSON.stringify(result);
    return serialised === undefined ? undefined : estimateTokenCount(serialised);
  } catch {
    return undefined;
  }
}
