"use client";

import {
  DonutChart,
  DonutChartCenter,
  DonutChartLegend,
  DonutChartPlot,
  type DonutSegment,
} from "@/components/charts/donut-chart";
import { agentColor } from "@/lib/agent-colors";
import { parseAgents } from "@/lib/filter-params";
import { useFilterNavigation } from "@/lib/use-filter-navigation";
import { ChartPanel } from "./chart-panel";

export type SpendByAgentChartProps = {
  /** Dollars per agent, from `querySpend().byAgent`. */
  byAgent: Readonly<Record<string, number>>;
  /** Every agent, so colours match the sidebar and filter however the set is narrowed. */
  allAgents: readonly string[];
};

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function SpendByAgentChart({ byAgent, allAgents }: SpendByAgentChartProps) {
  const { params, replaceAll } = useFilterNavigation();
  const selected = parseAgents(params.getAll("agent"));

  const segments: DonutSegment[] = Object.entries(byAgent)
    .sort(([, a], [, b]) => b - a)
    .map(([agent, cost]) => ({
      id: agent,
      name: agent,
      value: cost,
      color: agentColor(agent, allAgents),
    }));

  return (
    <ChartPanel title="Spend by agent" description="Click an agent to narrow the page to it.">
      {segments.length === 0 ? (
        <ChartEmpty />
      ) : (
        <DonutChart
          segments={segments}
          formatValue={usd}
          label="Spend by agent"
          selectedId={selected.length === 1 ? (selected[0] ?? null) : null}
          onSelect={(agent) =>
            replaceAll("agent", selected.length === 1 && selected[0] === agent ? [] : [agent])
          }
        >
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,13rem)_1fr]">
            <DonutChartPlot>
              <DonutChartCenter totalLabel="Total" />
            </DonutChartPlot>
            <DonutChartLegend />
          </div>
        </DonutChart>
      )}
    </ChartPanel>
  );
}

function ChartEmpty() {
  return <p className="py-12 text-center text-sm text-muted-foreground">No spend in this range.</p>;
}
