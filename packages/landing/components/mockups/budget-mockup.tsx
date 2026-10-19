import { BrowserFrame } from "@/components/mockups/browser-frame";
import { Badge } from "@/components/ui/badge";

const calls = [
  { name: "model_call · claude-sonnet-5", cost: "$1.84", status: "ok" as const },
  { name: "tool_call · refundTool", cost: "$0.92 / $1.00 cap", status: "warn" as const },
  { name: "model_call · claude-sonnet-5", cost: "$4.71 / $5.00", status: "warn" as const },
  { name: "tool_call · refundTool", cost: "blocked — cap exceeded", status: "blocked" as const },
];

const statusStyles = {
  ok: "border-border text-muted-foreground",
  warn: "border-accent bg-accent text-accent-foreground",
  blocked: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function BudgetMockup() {
  return (
    <BrowserFrame>
      <div className="space-y-5 p-6 text-xs tabular-nums">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>support-agent</span>
          <span>$4.71 / $5.00</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-[94%] rounded-full bg-primary" />
        </div>
        <div className="space-y-2">
          {calls.map((call) => (
            <div
              key={call.name + call.cost}
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
            >
              <span className="text-foreground">{call.name}</span>
              <Badge
                variant="outline"
                className={`rounded-sm text-[10px] uppercase ${statusStyles[call.status]}`}
              >
                {call.cost}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}
