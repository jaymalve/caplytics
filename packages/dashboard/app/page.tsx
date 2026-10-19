import { listAgents, listEvents, querySpend, querySpendByName } from "@caplytics/core/postgres";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { EventTable } from "@/components/event-table";
import { FilterBar } from "@/components/filter-bar";
import { SpendByAgentChart } from "@/components/spend-by-agent-chart";
import { SpendByNameChart } from "@/components/spend-by-name-chart";
import { SummaryCards } from "@/components/summary-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { decodeCursor } from "@/lib/cursor";
import { database } from "@/lib/database";
import { type FilterSearchParams, toEventFilter } from "@/lib/filter-params";
import { nextPageHref } from "@/lib/next-page-href";
import { auth, signOut } from "../auth";

/**
 * One page (§8.2), aggregates above the rows — see architecture/dashboard-overview-layout.md.
 * Every figure on it is computed by `@caplytics/core/postgres` from the same `EventFilter`, so a
 * card and the rows beneath it can never disagree about what was filtered.
 */
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
  // Every agent that has spent, not only those matching the current filter — narrowing the list to
  // the active filter would make it impossible to switch to any other agent.
  const agents = await listAgents(database());

  return (
    <DashboardSidebar
      agents={agents}
      email={session.user?.email ?? ""}
      signOut={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent spend</h1>
          <p className="text-sm text-muted-foreground">
            What your agents cost, by agent, by model and by call.
          </p>
        </header>

        <FilterBar agents={agents} />

        {/* Suspense per section, so a slow aggregate does not hold back the rows, or vice versa. */}
        <Suspense fallback={<OverviewSkeleton />}>
          <Overview params={params} agents={agents} />
        </Suspense>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Events</h2>
          <Suspense fallback={<TableSkeleton />}>
            <Events params={params} agents={agents} />
          </Suspense>
        </section>
      </main>
    </DashboardSidebar>
  );
}

async function Overview({
  params,
  agents,
}: {
  params: FilterSearchParams;
  agents: readonly string[];
}) {
  const filter = toEventFilter(params);
  const [spend, byName] = await Promise.all([
    querySpend(database(), filter),
    querySpendByName(database(), filter),
  ]);

  return (
    <>
      <SummaryCards
        totalCost={spend.totalCost}
        callCount={spend.callCount}
        unpricedCount={spend.unpricedCount}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <SpendByAgentChart byAgent={spend.byAgent} allAgents={agents} />
        <SpendByNameChart byName={byName} />
      </div>
    </>
  );
}

async function Events({
  params,
  agents,
}: {
  params: FilterSearchParams;
  agents: readonly string[];
}) {
  const cursor = decodeCursor(params.cursor);
  const page = await listEvents(database(), {
    ...toEventFilter(params),
    ...(cursor === undefined ? {} : { cursor }),
  });

  return (
    <EventTable
      events={page.events}
      allAgents={agents}
      nextPageHref={
        page.nextCursor === undefined
          ? undefined
          : nextPageHref(params as Record<string, string | string[] | undefined>, page.nextCursor)
      }
    />
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, card) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder cards
          <Skeleton key={card} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </>
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
