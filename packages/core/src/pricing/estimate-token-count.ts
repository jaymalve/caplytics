/**
 * Tool results are JSON, which tokenises denser than prose. Rounding toward more tokens keeps the
 * pre-call reservation on the safe side: over-reserving briefly throttles a run, under-reserving
 * lets it exceed its cap.
 */
const CHARS_PER_TOKEN = 3.5;

/**
 * Approximates a token count locally, for costs that must be known before the next provider
 * response reports the real figure.
 *
 * Deliberately a heuristic, not a tokeniser. An accurate count needs either the provider's
 * `count_tokens` endpoint — a network round trip, which cannot sit in the enforcement hot path —
 * or a vendor-specific tokeniser; OpenAI-derived tokenisers such as tiktoken materially miscount
 * Claude text, so borrowing one would trade an honest approximation for a confident wrong answer.
 *
 * This is why §3 carries both `costEstimate` and `costActual`: this figure is the former, and it is
 * superseded once real usage arrives.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
