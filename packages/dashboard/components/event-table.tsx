import type { CaplyticsEvent } from "@caplytics/core";
import { formatUsd } from "@caplytics/core";
import type { EventCursor } from "@caplytics/core/postgres";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { encodeCursor } from "@/lib/cursor";

export type EventTableProps = {
  events: readonly CaplyticsEvent[];
  nextCursor?: EventCursor | undefined;
  /** Current filters, preserved across pages so paging does not silently reset them. */
  searchParams: Record<string, string | string[] | undefined>;
};

export function EventTable({ events, nextCursor, searchParams }: EventTableProps) {
  if (events.length === 0) return <EmptyState />;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
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
              <TableRow key={event.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {new Date(event.timestamp).toISOString().replace("T", " ").slice(0, 19)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{event.agentId}</TableCell>
                <TableCell>
                  <Badge variant={event.type === "tool_call" ? "outline" : "secondary"}>
                    {event.type === "tool_call" ? "tool" : "model"}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs">{event.name}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatTokens(event.tokensIn)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatTokens(event.tokensOut)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {event.priceUnknown ? (
                    // §8.3: an unpriced call is labelled, never shown as $0.00 — that would read
                    // as free rather than unmeasured.
                    <Badge variant="outline" title="No price is known for this model">
                      price unknown
                    </Badge>
                  ) : (
                    formatUsd(event.costActual)
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {event.budgetRemaining === null ? "uncapped" : formatUsd(event.budgetRemaining)}
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
        {nextCursor === undefined ? null : (
          <Button asChild variant="outline">
            <Link href={nextPageHref(searchParams, nextCursor)}>Older</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Absent is different from zero: a tool call has no tokens of its own to report. */
function formatTokens(tokens: number | undefined): string {
  return tokens === undefined ? "—" : tokens.toLocaleString("en-US");
}

function nextPageHref(
  searchParams: Record<string, string | string[] | undefined>,
  cursor: EventCursor,
): string {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "cursor" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) next.append(key, item);
  }
  next.set("cursor", encodeCursor(cursor));

  return `/?${next.toString()}`;
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed p-12 text-center">
      <p className="text-sm font-medium">No events match these filters.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Spend appears here once an attached agent runs. Widen the date range, or clear the filters.
      </p>
    </div>
  );
}
