import { dollars, events } from "@/components/demo/data";
import { EventRows } from "@/components/demo/event-rows";
import { Surface, SurfaceHeader, SurfaceTitle } from "@/components/surface";

const SELECTED = 0;

// What the dashboard's drawer shows for the selected row. Estimate and actual differ
// because the estimate is made before the call and the actual comes from the provider's usage.
const detail = [
  { label: "Run", value: "run_3c90…a6d" },
  { label: "Input tokens", value: "12,480" },
  { label: "Cache read", value: "9,800" },
  { label: "Output tokens", value: "1,204" },
  { label: "Estimated", value: dollars(0.044, 3) },
  { label: "Actual", value: dollars(0.042, 3) },
  { label: "Budget remaining", value: dollars(3.29) },
];

export function EventsVisual() {
  const selected = events[SELECTED];
  return (
    <div className="grid gap-4 sm:relative sm:ml-auto sm:block sm:h-[39rem] sm:w-[88%]">
      <Surface className="sm:absolute sm:bottom-0 sm:left-0 sm:z-10 sm:w-[86%]">
        <SurfaceHeader>
          <SurfaceTitle>Events</SurfaceTitle>
          <span className="ml-auto text-xs text-muted-foreground">Last 30 days</span>
        </SurfaceHeader>
        <EventRows rows={events} selected={SELECTED} />
      </Surface>

      <Surface float className="sm:absolute sm:top-0 sm:-right-6 sm:z-20 sm:w-72">
        <SurfaceHeader className="flex-col items-start gap-y-1 pb-3">
          <SurfaceTitle className="text-sm">{selected?.name}</SurfaceTitle>
          <span className="text-xs text-muted-foreground">
            {selected?.type} · {selected?.agent}
          </span>
        </SurfaceHeader>
        <dl className="border-t border-border/60 px-6 py-3 text-[13px] tabular-nums">
          {detail.map((row) => (
            <div key={row.label} className="flex justify-between py-1">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">
          {selected?.meta}
        </div>
      </Surface>
    </div>
  );
}
