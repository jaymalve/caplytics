"use client";

import type { CaplyticsEvent } from "@caplytics/core";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { agentColor } from "@/lib/agent-colors";
import { formatTimestamp, formatTokens } from "@/lib/format-event";
import { BudgetRemaining, EventCost } from "./event-cost";
import { EventDrawer } from "./event-drawer";
import { EventTypeBadge } from "./event-type-badge";

export type EventTableProps = {
  events: readonly CaplyticsEvent[];
  allAgents: readonly string[];
  /** Built on the server from the cursor, so paging keeps the current filters (§8.5). */
  nextPageHref?: string | undefined;
};

/**
 * Newest first and deliberately unsortable — see architecture/table-sorting-and-cursors.md.
 * A row opens the drawer instead of a page: the event is already in hand, so there is nothing to
 * fetch and no second URL whose filters could drift from this one.
 */
export function EventTable({ events, allAgents, nextPageHref }: EventTableProps) {
  const [open, setOpen] = useState<CaplyticsEvent | null>(null);

  if (events.length === 0) return <EmptyState />;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>When (UTC)</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Tokens in</TableHead>
              <TableHead className="text-right">Tokens out</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow
                key={event.id}
                tabIndex={0}
                aria-label={`${event.name} at ${formatTimestamp(event.timestamp)}, open details`}
                className="cursor-pointer"
                onClick={() => setOpen(event)}
                onKeyDown={(pressed) => {
                  if (pressed.key !== "Enter" && pressed.key !== " ") return;
                  pressed.preventDefault();
                  setOpen(event);
                }}
              >
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {formatTimestamp(event.timestamp)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ background: agentColor(event.agentId, allAgents) }}
                    />
                    {event.agentId}
                  </span>
                </TableCell>
                <TableCell>
                  <EventTypeBadge type={event.type} />
                </TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs">{event.name}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatTokens(event.tokensIn)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatTokens(event.tokensOut)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  <EventCost event={event} />
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  <BudgetRemaining remaining={event.budgetRemaining} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Newest first. Paging is keyset, so rows cannot be skipped or repeated while new events
          arrive.
        </p>
        {nextPageHref === undefined ? null : (
          <Button asChild variant="outline">
            <Link href={nextPageHref}>Older</Link>
          </Button>
        )}
      </div>

      <EventDrawer event={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <p className="text-sm font-medium">No events match these filters.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Spend appears here once an attached agent runs. Widen the date range, or clear the filters.
      </p>
    </div>
  );
}
