import { agentDot, type DemoEvent, dollars } from "@/components/demo/data";
import { cn } from "@/lib/utils";

const typeStyles = {
  model_call: "bg-sky-50 text-sky-700 ring-sky-200",
  tool_call: "bg-amber-50 text-amber-700 ring-amber-200",
};

/** The event table body, shared by the product shot and the events feature row. */
export function EventRows({ rows, selected }: { rows: DemoEvent[]; selected?: number }) {
  return (
    <div className="text-[13px] tabular-nums">
      <div className="grid grid-cols-[1.4fr_1fr_1.3fr_auto] gap-4 border-b border-border/70 px-6 py-2.5 text-xs text-muted-foreground max-sm:grid-cols-[1.4fr_1fr_auto]">
        <span>Call</span>
        <span>Agent</span>
        <span className="max-sm:hidden">Metadata</span>
        <span className="text-right">Cost</span>
      </div>
      {rows.map((row, index) => (
        <div
          key={`${row.time}-${row.name}`}
          className={cn(
            "grid grid-cols-[1.4fr_1fr_1.3fr_auto] items-center gap-4 border-b border-border/50 px-6 py-3 last:border-b-0 max-sm:grid-cols-[1.4fr_1fr_auto]",
            index === selected && "bg-secondary/70",
          )}
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">{row.name}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  "rounded px-1.5 py-px text-[11px] ring-1 ring-inset",
                  typeStyles[row.type],
                )}
              >
                {row.type}
              </span>
              {row.time}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <span className={cn("size-1.5 shrink-0 rounded-full", agentDot(row.agent))} />
            <span className="truncate">{row.agent}</span>
          </span>
          <span className="truncate text-muted-foreground max-sm:hidden">{row.meta}</span>
          <span className="text-right font-medium">{dollars(row.cost, 3)}</span>
        </div>
      ))}
    </div>
  );
}
