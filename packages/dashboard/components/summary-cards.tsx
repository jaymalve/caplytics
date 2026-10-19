"use client";

import { Info } from "lucide-react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/motion/card";
import { Tooltip } from "@/components/motion/tooltip";

export type SummaryCardsProps = {
  /** Dollars, from `querySpend` — the whole filtered set, never the visible page. */
  totalCost: number;
  callCount: number;
  unpricedCount: number;
};

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Sub-cent averages are common, so they keep four places instead of rounding to $0.00. */
const preciseUsd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

const count = (value: number) => Math.round(value).toLocaleString("en-US");

export function SummaryCards({ totalCost, callCount, unpricedCount }: SummaryCardsProps) {
  // Unpriced calls cost nothing in the total, so they are left out of the average too — counting
  // them would drag it towards zero for calls nobody measured.
  const pricedCalls = callCount - unpricedCount;
  const averageCost = pricedCalls > 0 ? totalCost / pricedCalls : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Figure label="Total spend" value={totalCost} format={usd} />
      <Figure label="Calls" value={callCount} format={count} />
      <Figure
        label="Avg cost per call"
        value={averageCost}
        format={preciseUsd}
        hint="Priced calls only"
      />
      <Figure
        label="Unpriced calls"
        value={unpricedCount}
        format={count}
        hint="No known price for the model, so these are not in the total"
        tone={unpricedCount > 0 ? "warning" : "default"}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  format,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  format: (value: number) => string;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card size="compact">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {label}
          {hint === undefined ? null : (
            <Tooltip content={hint} side="top" arrow>
              <button type="button" aria-label={hint} className="text-muted-foreground">
                <Info className="size-3.5" />
              </button>
            </Tooltip>
          )}
        </CardDescription>
        <CardTitle
          className={
            tone === "warning"
              ? "text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400"
              : "text-2xl font-semibold tabular-nums"
          }
        >
          <AnimatedNumber value={value} format={format} />
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
