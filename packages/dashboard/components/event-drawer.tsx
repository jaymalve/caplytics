"use client";

import type { CaplyticsEvent } from "@caplytics/core";
import { formatUsd } from "@caplytics/core";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Drawer } from "@/components/motion/drawer";
import { formatTimestamp, formatTokens } from "@/lib/format-event";
import { BudgetRemaining, EventCost } from "./event-cost";
import { EventTypeBadge } from "./event-type-badge";

export type EventDrawerProps = {
  event: CaplyticsEvent | null;
  onClose: () => void;
};

/** Everything the table row has no room for: the run, the metadata, estimate against actual. */
export function EventDrawer({ event, onClose }: EventDrawerProps) {
  return (
    <Drawer
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      side="right"
      ariaLabel="Event details"
      className="w-full max-w-md gap-6 overflow-y-auto p-6"
    >
      {event === null ? null : (
        <>
          <header className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="self-start">
                <EventTypeBadge type={event.type} />
              </span>
              <h2 className="truncate font-mono text-sm font-semibold">{event.name}</h2>
              <p className="text-xs text-muted-foreground">{formatTimestamp(event.timestamp)}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </header>

          <Section title="Cost">
            <Row label="Actual">
              <EventCost event={event} />
            </Row>
            <Row label="Estimate">{formatUsd(event.costEstimate)}</Row>
            <Row label="Budget remaining">
              <BudgetRemaining remaining={event.budgetRemaining} />
            </Row>
          </Section>

          <Section title="Run">
            <Row label="Agent">{event.agentId}</Row>
            <Row label="Run id">
              <span className="font-mono text-xs">{event.runId}</span>
            </Row>
            <Row label="Event id">
              <span className="font-mono text-xs">{event.id}</span>
            </Row>
          </Section>

          {event.type === "model_call" ? (
            <Section title="Tokens">
              <Row label="In">{formatTokens(event.tokensIn)}</Row>
              <Row label="Out">{formatTokens(event.tokensOut)}</Row>
            </Section>
          ) : null}

          <Section title="Metadata">
            {Object.keys(event.metadata).length === 0 ? (
              <p className="text-sm text-muted-foreground">None attached.</p>
            ) : (
              Object.entries(event.metadata).map(([key, value]) => (
                <Row key={key} label={key}>
                  <span className="font-mono text-xs">{value}</span>
                </Row>
              ))
            )}
          </Section>
        </>
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <dl className="divide-y rounded-lg border">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
