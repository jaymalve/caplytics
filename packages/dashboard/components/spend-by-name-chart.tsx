"use client";

import type { NameSpend } from "@caplytics/core/postgres";
import {
  Treemap,
  TreemapLegend,
  type TreemapNode,
  TreemapPlot,
  TreemapTooltip,
} from "@/components/charts/treemap";
import { ChartPanel } from "./chart-panel";

export type SpendByNameChartProps = {
  byName: readonly NameSpend[];
};

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Models and tools are grouped so a cheap tool is never mistaken for a cheap model. */
const GROUPS = [
  { type: "model_call", id: "models", label: "Models", color: "var(--chart-1)" },
  { type: "tool_call", id: "tools", label: "Tools", color: "var(--chart-2)" },
] as const;

export function SpendByNameChart({ byName }: SpendByNameChartProps) {
  const data: TreemapNode[] = GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    color: group.color,
    children: byName
      .filter((row) => row.type === group.type)
      .map((row) => ({
        // Prefixed: a model and a tool may share a name, and tile ids must be unique.
        id: `${group.id}:${row.name}`,
        label: row.name,
        value: row.totalCost,
        description: `${row.callCount.toLocaleString("en-US")} calls`,
      })),
  })).filter((group) => group.children.length > 0);

  return (
    <ChartPanel title="Spend by model and tool" description="Where the money goes, by call name.">
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No spend in this range.</p>
      ) : (
        <Treemap data={data} label="Spend by model and tool" formatValue={usd}>
          <TreemapPlot className="h-64" />
          <TreemapTooltip />
          <TreemapLegend />
        </Treemap>
      )}
    </ChartPanel>
  );
}
