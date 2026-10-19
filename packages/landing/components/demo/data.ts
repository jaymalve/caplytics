/**
 * Illustrative data shared by every product visual on the page, so the product shot
 * and the feature rows show the same agents, customers and calls. None of it is live.
 */

export type Agent = { id: string; dot: string; bar: string; stroke: string; spend: number };

export const agents: Agent[] = [
  {
    id: "support-agent",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500/85",
    stroke: "stroke-emerald-500",
    spend: 318.2,
  },
  {
    id: "billing-agent",
    dot: "bg-orange-400",
    bar: "bg-orange-400/85",
    stroke: "stroke-orange-400",
    spend: 214.8,
  },
  {
    id: "triage-agent",
    dot: "bg-violet-500",
    bar: "bg-violet-500/85",
    stroke: "stroke-violet-500",
    spend: 196.4,
  },
];

export const customers = [
  { id: "cus_18213", spend: 241.6 },
  { id: "cus_90142", spend: 188.3 },
  { id: "cus_55710", spend: 74.2 },
];

export type EventType = "model_call" | "tool_call";

export type DemoEvent = {
  time: string;
  agent: string;
  type: EventType;
  name: string;
  meta: string;
  cost: number;
};

export const events: DemoEvent[] = [
  {
    time: "12s ago",
    agent: "support-agent",
    type: "model_call",
    name: "claude-sonnet-5",
    meta: "customerId: cus_18213",
    cost: 0.042,
  },
  {
    time: "31s ago",
    agent: "support-agent",
    type: "tool_call",
    name: "refundTool",
    meta: "channel: chat",
    cost: 0.005,
  },
  {
    time: "48s ago",
    agent: "billing-agent",
    type: "model_call",
    name: "claude-sonnet-5",
    meta: "customerId: cus_90142",
    cost: 0.068,
  },
  {
    time: "1m ago",
    agent: "triage-agent",
    type: "model_call",
    name: "claude-haiku-4-5",
    meta: "category: support",
    cost: 0.004,
  },
  {
    time: "2m ago",
    agent: "billing-agent",
    type: "tool_call",
    name: "lookupInvoice",
    meta: "customerId: cus_55710",
    cost: 0.002,
  },
];

export function agentDot(agentId: string) {
  return agents.find((agent) => agent.id === agentId)?.dot ?? "bg-muted-foreground";
}

export function dollars(value: number, digits = 2) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
