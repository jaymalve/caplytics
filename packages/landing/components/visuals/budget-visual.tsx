import { Ban, Check, TrendingDown } from "lucide-react";
import { dollars } from "@/components/demo/data";
import { Surface, SurfaceHeader, SurfaceTitle } from "@/components/surface";
import { cn } from "@/lib/utils";

const CAP = 5;

type Status = "ok" | "degraded" | "trimmed" | "blocked";

// One run, call by call, as its spend crosses the ladder's 70% and 85% rungs and then the cap.
const calls: { name: string; detail: string; cost: number | null; status: Status }[] = [
  { name: "model_call", detail: "claude-sonnet-5", cost: 1.84, status: "ok" },
  { name: "tool_call", detail: "refundTool", cost: 0.005, status: "ok" },
  { name: "model_call", detail: "claude-sonnet-5", cost: 1.66, status: "ok" },
  { name: "model_call", detail: "claude-haiku-4-5", cost: 0.41, status: "degraded" },
  { name: "model_call", detail: "claude-haiku-4-5 · maxTokens 500", cost: 0.8, status: "trimmed" },
  { name: "model_call", detail: "claude-sonnet-5", cost: null, status: "blocked" },
];

const statusStyles: Record<Status, string> = {
  ok: "text-muted-foreground",
  degraded: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200",
  trimmed: "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200",
  blocked: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
};

const ladder = [
  { at: "70%", action: "Switch to claude-haiku-4-5" },
  { at: "85%", action: "Cap output at 500 tokens" },
  { at: "100%", action: "Block the next call" },
];

export function BudgetVisual() {
  const spent = calls.reduce((sum, call) => sum + (call.cost ?? 0), 0);
  return (
    <div className="grid gap-4 sm:relative sm:ml-auto sm:block sm:h-[34rem] sm:w-[82%]">
      <Surface className="sm:absolute sm:inset-x-0 sm:top-28 sm:z-10">
        <SurfaceHeader>
          <SurfaceTitle>Run</SurfaceTitle>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            support-agent
          </span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">run_3c90…a6d</span>
        </SurfaceHeader>
        <div className="px-6 pb-4">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              <span className="text-lg font-medium text-foreground">{dollars(spent)}</span> of{" "}
              {dollars(CAP)}
            </span>
            <span>cap: block</span>
          </div>
          <div className="relative mt-2 h-2 rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(spent / CAP) * 100}%` }}
            />
            <span className="absolute inset-y-[-3px] left-[70%] w-px bg-foreground/30" />
            <span className="absolute inset-y-[-3px] left-[85%] w-px bg-foreground/30" />
          </div>
        </div>
        <ul className="border-t border-border/60 text-[13px] tabular-nums">
          {calls.map((call, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, never-reordered list; repeat calls share every other field.
              key={index}
              className="flex items-center gap-3 border-b border-border/50 px-6 py-2.5 last:border-b-0"
            >
              <span className="font-medium">{call.name}</span>
              <span className="min-w-0 truncate text-muted-foreground">{call.detail}</span>
              <span
                className={cn(
                  "ml-auto shrink-0 rounded px-1.5 py-px text-xs",
                  statusStyles[call.status],
                )}
              >
                {call.status === "ok" && call.cost !== null ? dollars(call.cost, 3) : call.status}
              </span>
            </li>
          ))}
        </ul>
      </Surface>

      <Surface float className="sm:absolute sm:top-0 sm:-right-6 sm:z-20 sm:w-72">
        <SurfaceHeader className="pb-2">
          <TrendingDown className="size-4 text-orange-500" />
          <SurfaceTitle className="text-sm">Degrade ladder</SurfaceTitle>
        </SurfaceHeader>
        <ul className="px-3 pb-3 text-[13px]">
          {ladder.map((rung) => (
            <li key={rung.at} className="flex items-center gap-3 rounded-lg px-3 py-2">
              <span className="w-9 text-muted-foreground tabular-nums">{rung.at}</span>
              <span className="min-w-0 flex-1 truncate">{rung.action}</span>
              {rung.at === "100%" ? (
                <Ban className="size-3.5 text-red-500" />
              ) : (
                <Check className="size-3.5 text-emerald-600" />
              )}
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}
