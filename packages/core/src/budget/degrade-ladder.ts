/**
 * One rung of §5's ladder: what to do once a given fraction of the cap is gone.
 *
 * A rung either swaps the model or caps its output. Both are expressed as data rather than the
 * hardcoded function §5 sketches, because §5.1 requires validating a *configured* ladder against
 * the block threshold — which is impossible if the ladder is code.
 */
export type DegradeRung =
  | { readonly at: number; readonly model: string }
  | { readonly at: number; readonly maxTokens: number };

export type DegradeLadder = readonly DegradeRung[];

/**
 * §5.1's headroom requirement, made concrete.
 *
 * A ladder whose top rung sits at the block threshold leaves a run one call wide: it degrades, the
 * next call blocks, and the degradation never had a chance to help. Ten percent of the cap is the
 * margin §5.1 suggests, and it is enforced rather than advised.
 */
export const REQUIRED_HEADROOM = 0.1;
const BLOCK_THRESHOLD = 1;

/**
 * The rung in force at a given fraction of the cap, or undefined below the lowest rung.
 *
 * Re-evaluated per call rather than cached, so a run moves between rungs in either direction as its
 * trajectory changes (§5). Highest applicable rung wins.
 */
export function resolveRung(
  usedFraction: number | null,
  ladder: DegradeLadder,
): DegradeRung | undefined {
  if (usedFraction === null) return undefined;

  let applicable: DegradeRung | undefined;
  for (const rung of ladder) {
    if (usedFraction >= rung.at && (applicable === undefined || rung.at > applicable.at)) {
      applicable = rung;
    }
  }
  return applicable;
}

/**
 * Rejects a ladder that cannot work, at attach time rather than mid-run (§5.1).
 *
 * Without this a run flaps: it degrades on one call and blocks on the next, having paid the cost of
 * switching models for no benefit.
 */
export function assertValidLadder(ladder: DegradeLadder, blocks: boolean): void {
  if (ladder.length === 0) return;

  for (const rung of ladder) {
    if (!(rung.at > 0 && rung.at < BLOCK_THRESHOLD)) {
      throw new Error(
        `caplytics: degrade threshold ${rung.at} must be between 0 and 1 (a fraction of the cap).`,
      );
    }
    if ("maxTokens" in rung && rung.maxTokens <= 0) {
      throw new Error(`caplytics: degrade maxTokens must be positive, got ${rung.maxTokens}.`);
    }
    if ("model" in rung && rung.model.trim().length === 0) {
      throw new Error("caplytics: a degrade rung's model must be a non-empty model id.");
    }
  }

  const thresholds = ladder.map((rung) => rung.at);
  if (new Set(thresholds).size !== thresholds.length) {
    throw new Error(
      "caplytics: degrade thresholds must be distinct — two rungs cannot both apply.",
    );
  }

  const highest = Math.max(...thresholds);
  if (blocks && highest > BLOCK_THRESHOLD - REQUIRED_HEADROOM) {
    throw new Error(
      `caplytics: the highest degrade threshold (${highest}) leaves no room before the budget ` +
        `blocks at ${BLOCK_THRESHOLD}. Keep it at or below ` +
        `${BLOCK_THRESHOLD - REQUIRED_HEADROOM}, or the run will degrade and then block ` +
        "immediately without the degradation helping.",
    );
  }
}
