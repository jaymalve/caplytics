# The dashboard leads with aggregates, and its components come from beUI

**Implements:** §8.2, §8.3
**Status:** Accepted — amends §8.2 and §8.3

## Decision

The dashboard is still a single page, but it no longer opens straight onto the event table:

- **Sidebar.** The agents that have spent, each one a link that filters the page, plus the signed-in
  account. This is not page navigation. There is still only one page.
- **Filter bar.** A date range picker, a multi-select agent filter, and the metadata key/value
  filter.
- **Summary cards.** Total spend, calls, average cost per call, and unpriced calls for the filtered
  set.
- **Breakdowns.** A donut chart of spend by agent and a treemap of spend by model or tool name.
- **Event table.** Unchanged in what it shows. Clicking a row opens a drawer with the full event:
  run id, metadata, token counts, estimate against actual cost, and budget remaining.

Components come from [beUI](https://beui.dev) (MIT, distributed through the shadcn registry) rather
than stock shadcn: Animated Sidebar, Date Range Picker, Multi Select, Card, Number Animation,
Animated Badge, Donut Chart, Treemap, Tooltip and Drawer. They are copied into
`components/motion/` and `components/charts/`, next to the vendored `components/ui/`, and they read
the same shadcn theme tokens.

## Rationale

§8.2 says "no summary cards — aggregate totals are visible from the table itself". That was true
of an unpaginated table. It stopped being true once §8.5 settled on keyset pagination: the table
shows fifty rows out of thousands, so no total can be read off it. Summing the visible page would
give a number that only looks like the total.
[table-sorting-and-cursors.md](table-sorting-and-cursors.md) reached the same conclusion from the
other side: "which calls cost the most" is a question about the whole filtered set, and it belongs
in the aggregate.

The summary cards and breakdowns are that aggregate. Every figure on them comes from
`@caplytics/core/postgres` with the same `EventFilter` the table uses. So a card and the rows under
it always agree about what was filtered (§8.1, §8.4).

Two query-layer changes follow, and both live in core rather than in the dashboard:

- `EventFilter.agentId` accepts a list as well as a single id, so the multi-select maps onto the
  filter unmodified (§8.4). A single string still works, so §6.2 callers are unaffected.
- `querySpendByName` totals spend per model or tool name for the treemap. It is a separate function
  rather than a new field on `SpendSummary`, so §6.2's answer shape stays as designed.

The donut needs nothing new, because `querySpend` already returns `byAgent`.

## Alternatives considered

- **Keep §8.2 as written.** Rejected: it leaves the dashboard unable to answer "how much did we
  spend", which is the question it exists for.
- **A separate overview page.** Rejected for v1: two pages that each need the same filter state
  are two places for that state to drift. One page with the aggregate above the rows keeps a single
  URL as the query.
- **Stock shadcn plus a chart library such as Recharts.** This works, but beUI already provides the
  donut, the treemap and an animated date range in the same registry format, so adding a second
  visual language was not needed.

## Constraints that still hold

- The table stays unsortable and keyset-paginated.
- Skeleton loaders only. beUI's Loader is not used.
- `components/motion/` and `components/charts/` are vendored like `components/ui/`. Re-running
  `shadcn add` regenerates them, so local edits there do not survive.

## What it costs

- **Lint and formatting.** Biome skips the vendored beUI paths, including the helpers beUI places
  in `lib/` (`lib/hooks/`, `ease.ts`, `presence-gate.tsx`, `touch.ts`). Formatting is skipped as
  well as linting, so regenerating them cannot fail `verify`.
- **Type checking.** The dashboard turns off `noUncheckedIndexedAccess`, because beUI source does
  not compile with it and tsc checks everything that is imported. This is the same trade the
  package already made with `exactOptionalPropertyTypes` for `components/ui/`. It applies to the
  whole dashboard package, not only the vendored files. The two library packages keep it on, and
  all query logic lives there.
- **Dependencies.** The beUI components add `motion` and `@floating-ui/dom`.
