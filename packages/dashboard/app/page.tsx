import { formatUsd, usdToMicroDollars } from "@caplytics/core";
import { listAgents, listEvents, querySpend } from "@caplytics/core/postgres";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EventTable } from "@/components/event-table";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { decodeCursor } from "@/lib/cursor";
import { database } from "@/lib/database";
import { type FilterSearchParams, toEventFilter } from "@/lib/filter-params";
import { auth, signOut } from "../auth";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<FilterSearchParams>;
}) {
  // The authoritative check. Middleware only redirects on a missing cookie, which proves nothing —
  // this verifies the session itself, so a forged cookie reaches no data.
  const session = await auth();
  if (session === null) redirect("/login");

  const params = await searchParams;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">Caplytics</h1>
          <p className="text-sm text-muted-foreground">Agent spend, by run and by call.</p>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="flex items-center gap-3"
        >
          <span className="text-sm text-muted-foreground">{session?.user?.email}</span>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </header>

      {/* Suspense per section, so a slow aggregate does not hold back the filter controls. */}
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <Filters />
      </Suspense>

      <Suspense fallback={<SummarySkeleton />}>
        <Summary params={params} />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <Events params={params} />
      </Suspense>
    </main>
  );
}

async function Filters() {
  // Every agent that has spent, not only those matching the current filter — narrowing the list to
  // the active filter would make it impossible to switch to any other agent.
  const agents = await listAgents(database());

  return <FilterBar agents={agents} />;
}

/**
 * §8.2 has no summary cards — the table carries the totals. This is the filtered aggregate only,
 * which is what §6.2's `query()` answers and what the table below it will page through.
 */
async function Summary({ params }: { params: FilterSearchParams }) {
  const spend = await querySpend(database(), toEventFilter(params));

  return (
    <section className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
      <Figure label="Total" value={formatUsd(usdToMicroDollars(spend.totalCost))} />
      <Figure label="Calls" value={String(spend.callCount)} />
      {spend.unpricedCount > 0 ? (
        <Figure
          label="Unpriced"
          value={String(spend.unpricedCount)}
          // Surfaced rather than folded into the total: those calls cost money nobody can attribute.
          hint="not included in the total"
        />
      ) : null}
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-lg">{value}</span>
      {hint === undefined ? null : <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

async function Events({ params }: { params: FilterSearchParams }) {
  const page = await listEvents(database(), {
    ...toEventFilter(params),
    ...(decodeCursor(params.cursor) === undefined
      ? {}
      : // biome-ignore lint/style/noNonNullAssertion: guarded by the check above
        { cursor: decodeCursor(params.cursor)! }),
  });

  return (
    <EventTable
      events={page.events}
      nextCursor={page.nextCursor}
      searchParams={params as Record<string, string | string[] | undefined>}
    />
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
        <Skeleton key={row} className="h-10 w-full" />
      ))}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="flex gap-8">
      <Skeleton className="h-12 w-28" />
      <Skeleton className="h-12 w-20" />
    </div>
  );
}
