import { agents, customers, dollars } from "@/components/demo/data";
import { Surface, SurfaceHeader, SurfaceTitle } from "@/components/surface";
import { cn } from "@/lib/utils";

// Hourly spend per agent, in dollars, in the same order as `agents`. Shaped to rise into
// the afternoon so the chart reads like a real working day.
const hours = [
  [6, 4, 3],
  [8, 5, 2],
  [7, 6, 4],
  [12, 7, 5],
  [15, 8, 4],
  [11, 9, 6],
  [9, 6, 3],
  [7, 4, 2],
  [5, 3, 2],
  [4, 3, 1],
  [6, 2, 3],
  [8, 5, 4],
  [13, 9, 6],
  [17, 10, 8],
  [21, 12, 9],
  [18, 11, 7],
  [16, 13, 10],
  [22, 14, 9],
  [25, 15, 11],
  [19, 12, 8],
];
const MAX = 60;
const ticks = [60, 45, 30, 15, 0];
const labels = ["09:00", "13:00", "17:00", "21:00"];

export function CostVisual() {
  const customerMax = Math.max(...customers.map((customer) => customer.spend));
  return (
    <div className="grid gap-4 sm:relative sm:ml-auto sm:block sm:h-[33rem] sm:w-[82%]">
      <Surface className="sm:absolute sm:inset-x-0 sm:top-12 sm:z-10">
        <SurfaceHeader>
          <SurfaceTitle>Spend over time</SurfaceTitle>
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            {agents.map((agent) => (
              <span
                key={agent.id}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span className={cn("size-2 rounded-full", agent.dot)} />
                {agent.id}
              </span>
            ))}
          </div>
        </SurfaceHeader>
        <div className="flex gap-3 px-6 pt-2 pb-5">
          <div className="flex h-48 flex-col justify-between text-[11px] text-muted-foreground tabular-nums">
            {ticks.map((tick) => (
              <span key={tick}>${tick}</span>
            ))}
          </div>
          <div className="flex-1">
            <div className="flex h-48 items-end justify-between gap-1 border-b border-border/70">
              {hours.map((hour, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: the hour's position is its identity.
                  key={index}
                  className="flex w-full max-w-3 flex-col-reverse gap-px"
                >
                  {hour.map((spend, agentIndex) => (
                    <span
                      key={agents[agentIndex]?.id}
                      className={cn("rounded-[2px]", agents[agentIndex]?.bar)}
                      style={{ height: `${(spend / MAX) * 12}rem` }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              {labels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      </Surface>

      <Surface float className="sm:absolute sm:right-[-1.5rem] sm:bottom-0 sm:z-20 sm:w-72">
        <SurfaceHeader className="pb-1">
          <SurfaceTitle className="text-sm">By customer</SurfaceTitle>
          <span className="ml-auto text-xs text-muted-foreground">metadata.customerId</span>
        </SurfaceHeader>
        <ul className="px-3 pb-3 text-[13px] tabular-nums">
          {customers.map((customer) => (
            <li key={customer.id} className="rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <span>{customer.id}</span>
                <span className="font-medium">{dollars(customer.spend)}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(customer.spend / customerMax) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}
