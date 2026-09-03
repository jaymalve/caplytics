# The event table is not sortable, because the cursor fixes its order

**Implements:** §8.2, §8.5
**Status:** Accepted — narrows §8.2

## Decision

The event table renders newest-first and offers no column sorting.

## Rationale

§8.2 describes the table as "paginated, sortable". §8.5 specifies keyset pagination on `timestamp`.
Those two cannot both hold: a keyset cursor is a position in one specific ordering, so changing the
sort column invalidates every cursor. Sorting by cost with a `(timestamp, id)` cursor would page
through an order the cursor does not describe, skipping and repeating rows — the exact failure §8.5
chose keyset pagination to avoid.

The alternatives were:

- **Offset pagination, so any column can sort.** Rejected: §8.5 rules it out explicitly, and its
  reasons are unchanged — cost grows with depth on an append-only table, and rows shift under a
  reader as new events insert mid-browse.
- **A cursor per sort column.** Each sortable column needs its own index and its own tiebreaker, and
  the URL cursor becomes meaningless if the sort changes underneath it. Real, but not v1 work.
- **Client-side sorting of the current page.** Rejected as worse than nothing: sorting fifty rows
  out of thousands looks like sorting the data and is not.

Sorting is not the need behind §8.2 anyway. "Which calls cost the most" is a question about the
whole filtered set, not a page of it — that belongs in the aggregate (§6.2), where it can be
answered honestly, rather than in a column header that only reorders what happens to be on screen.

## What this leaves

Ordering is fixed at `timestamp DESC, id DESC`. The filter bar narrows *which* events; the table
shows them newest first and pages backwards through time.

If per-column sorting is wanted later, the honest shape is a sort parameter that participates in the
cursor — `(sortColumn, id)` keyset with a matching index per column — not offset pagination.
