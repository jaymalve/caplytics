"use client";

import type { CaplyticsEventType } from "@caplytics/core";
import { Sparkles, Wrench } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";

export function EventTypeBadge({ type }: { type: CaplyticsEventType }) {
  return type === "tool_call" ? (
    <AnimatedBadge status="neutral" size="sm" icon={<Wrench className="size-3" />}>
      tool
    </AnimatedBadge>
  ) : (
    <AnimatedBadge status="info" size="sm" icon={<Sparkles className="size-3" />}>
      model
    </AnimatedBadge>
  );
}
