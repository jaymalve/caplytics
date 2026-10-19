import { CalendarDays, ChevronDown, LayoutGrid, Plus } from "lucide-react";
import { agents, dollars, events } from "@/components/demo/data";
import { EventRows } from "@/components/demo/event-rows";
import { Logo } from "@/components/logo";
import { Surface } from "@/components/surface";
import { cn } from "@/lib/utils";

/**
 * The dashboard, hand-built at full width under the hero the way foglamp.dev shows its app.
 * It mirrors the real overview page (architecture/dashboard-overview-layout.md): agent
 * sidebar, filter bar, summary cards, breakdowns, then the event table.
 */
export function ProductShot() {
  const total = agents.reduce((sum, agent) => sum + agent.spend, 0);
  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <Surface aria-hidden className="flex select-none max-md:rounded-2xl">
        <Sidebar />
        <div className="min-w-0 flex-1 border-border/60 md:border-l">
          <div className="flex items-center gap-2 px-6 pt-5 text-base font-medium">
            <LayoutGrid className="size-4 text-muted-foreground" />
            Overview
          </div>
          <FilterBar />
          <SummaryCards total={total} />
          <div className="grid gap-4 px-6 pb-4 lg:grid-cols-2">
            <SpendByAgent total={total} />
            <SpendByModel />
          </div>
          <div className="border-t border-border/60">
            <EventRows rows={events} />
          </div>
        </div>
      </Surface>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="hidden w-52 shrink-0 flex-col gap-1 p-3 md:flex">
      <div className="flex items-center gap-2 px-2 py-2 font-medium text-primary">
        <Logo className="size-4" />
        Caplytics
      </div>
      <div className="mt-3 px-2 pb-1 text-xs text-muted-foreground">Agents</div>
      {agents.map((agent, index) => (
        <div
          key={agent.id}
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]",
            index === 0 ? "bg-secondary text-foreground" : "text-muted-foreground",
          )}
        >
          <span className={cn("size-2 rounded-full", agent.dot)} />
          {agent.id}
        </div>
      ))}
      <div className="mt-auto flex items-center gap-2 px-2 pt-24 text-[13px] text-muted-foreground">
        <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-medium text-accent-foreground">
          A
        </span>
        you@company.com
      </div>
    </div>
  );
}

function FilterBar() {
  const pill =
    "flex h-7 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs text-muted-foreground";
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-4">
      <span className={pill}>
        <CalendarDays className="size-3.5" />
        Last 30 days
      </span>
      <span className={pill}>
        All agents
        <ChevronDown className="size-3.5" />
      </span>
      <span className={pill}>
        <Plus className="size-3.5" />
        metadata
      </span>
    </div>
  );
}

function SummaryCards({ total }: { total: number }) {
  const cards = [
    { label: "Total spend", value: dollars(total) },
    { label: "Calls", value: "18,204" },
    { label: "Avg cost / call", value: dollars(total / 18204, 3) },
    { label: "Unpriced calls", value: "12" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 px-6 pb-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl bg-background/60 p-4 shadow-(--shadow-card)">
          <div className="text-xs text-muted-foreground">{card.label}</div>
          <div className="mt-1 text-xl font-medium tracking-tight tabular-nums">{card.value}</div>
        </div>
      ))}
    </div>
  );
}

function SpendByAgent({ total }: { total: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-6 rounded-2xl bg-background/60 p-4 shadow-(--shadow-card)">
      <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90">
        <title>Spend by agent</title>
        {agents.map((agent) => {
          const length = (agent.spend / total) * circumference;
          const segment = (
            <circle
              key={agent.id}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="14"
              className={agent.stroke}
              strokeDasharray={`${length - 1.5} ${circumference}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return segment;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2 text-[13px]">
        <div className="text-xs text-muted-foreground">Spend by agent</div>
        {agents.map((agent) => (
          <div key={agent.id} className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", agent.dot)} />
            <span className="truncate text-muted-foreground">{agent.id}</span>
            <span className="ml-auto font-medium tabular-nums">{dollars(agent.spend)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A treemap reduced to its essence: tile area tracks each model's or tool's share of spend.
const byName = [
  {
    name: "claude-sonnet-5",
    spend: 512.3,
    className: "row-span-2 bg-emerald-500/15 text-emerald-800",
  },
  { name: "claude-haiku-4-5", spend: 141.9, className: "bg-orange-400/15 text-orange-800" },
  { name: "refundTool", spend: 75.2, className: "bg-violet-500/15 text-violet-800" },
];

function SpendByModel() {
  return (
    <div className="rounded-2xl bg-background/60 p-4 shadow-(--shadow-card)">
      <div className="text-xs text-muted-foreground">Spend by model or tool</div>
      <div className="mt-3 grid h-28 grid-cols-[1.8fr_1fr] grid-rows-2 gap-1.5 text-[12px]">
        {byName.map((tile) => (
          <div
            key={tile.name}
            className={cn("flex flex-col justify-end rounded-lg p-2.5", tile.className)}
          >
            <span className="truncate font-medium">{tile.name}</span>
            <span className="tabular-nums opacity-80">{dollars(tile.spend)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
