"use client";

import type { CaplyticsEvent } from "@caplytics/core";
import { formatUsd } from "@caplytics/core";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Tooltip } from "@/components/motion/tooltip";

/**
 * §8.3: an unpriced call is labelled, never shown as $0.00 — that would read as free rather than
 * unmeasured.
 */
export function EventCost({ event }: { event: CaplyticsEvent }) {
  if (!event.priceUnknown) return <>{formatUsd(event.costActual)}</>;

  return (
    <Tooltip content="No price is known for this model, so its cost is not counted" side="left">
      <span>
        <AnimatedBadge status="warning" size="sm">
          price unknown
        </AnimatedBadge>
      </span>
    </Tooltip>
  );
}

/** Null means the run is uncapped (§10), which is different from a remainder of zero. */
export function BudgetRemaining({ remaining }: { remaining: CaplyticsEvent["budgetRemaining"] }) {
  if (remaining === null) return <span className="text-muted-foreground">uncapped</span>;
  if (remaining < 0) {
    return (
      <AnimatedBadge status="danger" size="sm">
        {formatUsd(remaining)}
      </AnimatedBadge>
    );
  }
  return <>{formatUsd(remaining)}</>;
}
