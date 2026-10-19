import { BrowserFrame } from "@/components/mockups/browser-frame";
import { Badge } from "@/components/ui/badge";

const rows = [
  { agent: "support-agent", type: "model_call", metadata: "customerId: cus_18213", cost: "$0.042" },
  { agent: "support-agent", type: "tool_call", metadata: "channel: chat", cost: "$0.011" },
  { agent: "billing-agent", type: "model_call", metadata: "customerId: cus_90142", cost: "$0.068" },
  { agent: "triage-agent", type: "model_call", metadata: "category: support", cost: "$0.019" },
];

const filters = ["Last 30 days", "agent: support-agent", "+ metadata"];

export function EventTableMockup() {
  return (
    <BrowserFrame>
      <div className="p-6 text-xs tabular-nums">
        <div className="mb-4 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Badge key={filter} variant="outline" className="rounded-sm text-muted-foreground">
              {filter}
            </Badge>
          ))}
        </div>
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-4 gap-2 border-b border-border bg-secondary px-3 py-2 text-muted-foreground">
            <span>agent</span>
            <span>type</span>
            <span>metadata</span>
            <span className="text-right">cost</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.agent + row.metadata}
              className="grid grid-cols-4 gap-2 border-b border-border px-3 py-2 text-foreground last:border-b-0"
            >
              <span>{row.agent}</span>
              <span className="text-muted-foreground">{row.type}</span>
              <span className="truncate text-muted-foreground">{row.metadata}</span>
              <span className="text-right">{row.cost}</span>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}
