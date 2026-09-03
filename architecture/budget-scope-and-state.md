# Budget scope is per-run; state is in-memory

**Implements:** §4, §5
**Status:** Accepted — fills a gap in §4
**Resolves:** open item 4

## Decision

- **`cap` is per run.** It resets on every `.generate()` / `.stream()` invocation.
- **State lives in memory**, per process, behind a `BudgetStore` interface.
- **Default when unconfigured:** `cap: 1.00` per run with `onLimit: "warn"`. Opt out with `cap: "unlimited"`.

## Rationale

### Scope

§4 never defines the window `cap` spans, and the document is inconsistent with itself: §4.1's error carries `{ runId, budget }`, implying run scope, while §2.2 describes `config.budget` as letting "multiple agents share one pool," implying something durable.

Per-run is chosen because it is the only scope enforceable without putting a database in the hot path. A windowed cap requires an atomic read-modify-write against Postgres *before every model call*, which contradicts the "zero new infra" principle §7 argues from, and forces a fail-open/fail-closed decision when the database is unreachable — i.e. either the cap silently stops working or every agent stops working.

`config.budget` retains its §2.2 meaning: several agents in one run share a pool, which is coherent under run scope (an orchestrator agent delegating to sub-agents).

Windowed caps (`window: "day" | "month"`) are a v2 feature. `BudgetStore` exists so they can arrive without touching `attach()` — but not as a free swap: every method on the interface is synchronous, and that is what makes a reservation atomic against parallel tool calls. A persistent store cannot inherit in-process atomicity; it needs its own strategy at the database level and an awaitable interface. Treat `BudgetStore` as the shape of the in-process contract, not as one a remote store drops into unchanged.

### State location

Per-process, with the limitation documented prominently rather than hidden: **N replicas means N independent caps.** A $5 cap across 4 replicas can spend $20 in wall-clock parallel.

This is acceptable at v1 because caps are per-run, and a single run does not span processes. The limitation only bites for the v2 windowed caps, which is exactly when the Postgres-backed store arrives.

Postgres remains **write-only** in v1: it receives events for §6.2 and §8, and is never read to make an enforcement decision. This keeps the database entirely off the critical path — an outage degrades observability, never agent execution.

### Default cap

§10's open item 4 requires that zero-config enforce something rather than silently no-op, while §10's item 2 recommends `"warn"` so a new tool never kills a first run. Both hold simultaneously: **$1.00 per run, warn on breach.** The user is told, loudly and once, and nothing breaks.

$1.00 is roughly an order of magnitude above a normal agent turn and an order of magnitude below a runaway loop — high enough not to cry wolf, low enough to fire before a bad loop gets expensive.

`cap: "unlimited"` is spelled explicitly rather than accepting `Infinity` or `undefined`, so opting out of spend control is a visible, greppable choice in a diff.

## Reserve and settle

Enforcement is pre-call (§4.1); actual cost is only known post-call. The ledger therefore needs three operations, not one:

- `reserve(estimate)` — before the call; throws or degrades if it would breach
- `settle(actual)` — after the call; corrects the reservation to true cost
- `release()` — on call failure; returns the reservation

Mastra runs tool calls in parallel, so `reserve` must be atomic against concurrent callers within the process. §5's `budgetState.spent` quietly assumes this machinery exists; it is stated here because it is not free.

## Alternatives considered

- **Postgres-backed enforcement from day one** — rejected for v1. Adds a synchronous round-trip before every model and tool call, and couples agent liveness to database liveness for a guarantee (cross-replica caps) that per-run scope does not need.
- **Lifetime caps** — rejected. An agent that permanently stops working after its 5th dollar is a support ticket, not a feature.
- **No default cap** — rejected by §10 item 4.
