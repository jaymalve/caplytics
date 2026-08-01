# Caplytics: The TypeScript Framework to Spend-Control and Track AI Agent Costs
**Status:** Draft v1
**Scope:** Type-safe budget attachment, granular observability, hard stop, graceful degradation.
**Package:** Published to npm as `caplytics`.
**Framework support:** Mastra first. Core design (interception model, event schema, budget/type-safety patterns) is framework-agnostic by construction — additional framework adapters (e.g. LangChain, Vercel AI SDK) are v2+ concerns, implemented as thin adapters over the same `@caplytics/core` used by the dashboard. Section 1 of this document covers the Mastra adapter specifically; treat it as the reference implementation of the adapter pattern, not the whole system.
---
## 1. Integration Model (Mastra Adapter)
Caplytics attaches to a Mastra `Agent` instance via a single wrapper call. No changes to agent construction, tool definitions, or downstream code (`.generate()`, `.stream()`, workflows, Studio).

```ts
export const supportAgent = caplytics.attach(
  new Agent({
    id: "support-agent",
    model: "anthropic/claude-sonnet-5",
    tools: { searchDocsTool, refundTool },
  }),
  {
    cap: 5.00,
    tools: { refundTool: { cap: 1.00 } },
  }
);
```

`attach()` returns the same agent type (`T`, not a widened `Agent<any>`). Downstream consumers (`new Mastra({ agents: { supportAgent } })`) retain full type inference.
### Interception points
Two, and only two, surfaces generate cost. Both are intercepted inside `attach()`; no third mechanism is introduced.
| Surface | Mechanism |
|---|---|
| Model calls | `attach()` replaces the model string with a resolver function invoked on every call, not once at construction |
| Tool calls | `attach()` wraps each tool's `execute()` in the agent's `tools` map |
Rule: any future cost surface (e.g. sub-agent spawned from a tool) extends this same nested shape. No new attachment point without revisiting this document.
---
## 2. Type Safety
### 2.1 Tool budgets — inferred from the agent's tool map

```ts
type ToolNames<T> = T extends Agent<any, infer TTools, any> ? keyof TTools : never;
type CaplyticsConfig<T extends Agent<any, any, any>> = {
  budget?: string;
  cap?: number;
  onLimit?: "warn" | "block" | "degrade";
  tools?: Partial<Record<ToolNames<T>, { cap: number; onLimit?: "warn" | "block" }>>;
};
```

- Tool names in `config.tools` are constrained to keys that exist on the passed-in agent's `tools` map. Typos and stale references fail at compile time.
- Depends on Mastra's `Agent` class preserving its tools map as an inspectable generic. **Unverified against current `.d.ts` — confirm generic slot ordering before implementation.** If unavailable, fallback is a local `InferAgentTools<T>` helper; config shape is unaffected either way.
### 2.2 Budget key — inferred from `agent.id`, not re-declared

```ts
const budgetKey = config?.budget ?? agent.id;
```

`id` is already required at `Agent` construction. Do not ask for a second string that must stay in sync with it. `config.budget` remains as an explicit override only, for the case of multiple agents sharing one pool.
**Principle:** if a config value duplicates something already declared elsewhere on the object being wrapped, infer it. Do not validate a duplicate — eliminate it.
---
## 3. Observability
Every model call and tool call emits one structured event. No separate reporting layer; enforcement and observability read from the same event.

```ts
type CaplyticsEvent = {
  runId: string;
  agentId: string;
  type: "model_call" | "tool_call";
  name: string;
  costEstimate: number;
  costActual: number;
  tokensIn?: number;
  tokensOut?: number;
  budgetRemaining: number;
  timestamp: string;
  metadata: Record<string, string>;
};
```

Subscription is owned by `caplytics`, keyed by budget key (default `agent.id`) — **not** attached to the agent instance. Attaching it to the agent (`supportAgent.caplytics.on(...)`) would require `attach()` to return `T & { caplytics: ... }`, which breaks the same-`T` return guarantee in section 1 and risks colliding with Mastra's own `Agent` surface in future versions.

```ts
caplytics.on("support-agent", (event: CaplyticsEvent) => { ... });
// or, scoped handle:
const monitor = caplytics.agent("support-agent");
monitor.on("call", (event) => { ... });
```

This also decouples subscription from the agent definition file — a monitoring/ops module can subscribe by budget key without importing the agent instance at all.
No polling API. No required dashboard. The event stream is the single source of truth consumed by: console warnings, hard-stop decisions, degradation decisions, and any external dashboard.
---
## 4. Hard Stop
Two distinct stop conditions. Do not conflate them in implementation or in user-facing messaging.
### 4.1 Between calls (primary mechanism)
Every model/tool call is checked against remaining budget before it fires.

```ts
if (budgetRemaining <= 0 && policy === "block") {
  throw new CaplyticsBudgetExceededError({ runId, budget: budgetKey });
}
```

Propagates through Mastra's agent loop as a standard call failure. No special-case handling required on the Mastra side.
### 4.2 Mid-stream (secondary mechanism, best-effort)
For a single long-running `.stream()` call that would cross the cap before the next call boundary: thread an `AbortSignal` into the model call, abort once running token count crosses `budgetRemaining`.
**Constraint:** tokens already streamed before the abort fires are not recoverable. This is a "stop as fast as possible," not a "guarantee zero overage" mechanism.
**Requirement:** any hard-stop UI/log output must reflect actual spend at stop time (e.g. `"stopped after $5.02 of $5.00"`), not the configured cap. Do not present false precision.
---
## 5. Degradation
Same interception point as hard stop. Evaluated before every call, not once per run.

```ts
function resolveModelForCall(baseModel: string, budgetState: BudgetState): string | null {
  const pctUsed = budgetState.spent / budgetState.cap;
  if (pctUsed >= 0.95) return null;                                   // hard block
  if (pctUsed >= 0.85) return applyMaxTokensCap(baseModel, 500);
  if (pctUsed >= 0.70) return downgrade(baseModel, "anthropic/claude-haiku-4-5");
  return baseModel;
}
```

- Re-resolved on every call, not cached at agent creation. A run can move between rungs in either direction as its cost trajectory changes mid-task.
- Model swap is invisible to agent/framework code — Mastra resolves models from a string, and `attach()` returns a new string per call. No code downstream is aware a swap occurred.
- Tool-level degradation follows the identical ladder shape (e.g. skip an optional sub-call at 90% of a tool's own cap). One mental model for both surfaces.
### 5.1 Validation rule (required, not optional)
If both a degradation ladder and a hard block are configured, the highest degrade threshold must leave real headroom below the block threshold (e.g. degrade ladder capped at ≤90% if block fires at 100%). Reject configs that violate this at attach-time. Without this check, a run will flap between "just downgraded" and "blocked" within one or two calls.
---
## 6. Metadata Filtering
Budgets answer "how much did this agent spend." Metadata answers "how much did we spend for this customer / category / window" — a query across agents, not within one.
### 6.1 Attaching metadata
Two levels, merged, not exclusive:

```ts
// Agent-level default, set once
caplytics.attach(supportAgent, { cap: 5.00, metadata: { category: "customer-support" } });
// Per-call override, merges over the agent-level default
await supportAgent.generate(messages, {
  caplytics: { metadata: { customerId: "cus_18213", channel: "chat" } },
});
```

Keys are arbitrary, string-valued, unopinionated. Do not pre-define a fixed set of supported dimensions — values are business data, not something Caplytics validates against.
### 6.2 Querying
The `.on()` event stream (section 3) is a subscription to the present; it cannot answer historical aggregate queries. Filtering requires persisted, queryable events:

```ts
const spend = await caplytics.query({
  metadata: { customerId: "cus_18213" },
  from: "2026-07-01",
  to: "2026-07-31",
});
// { totalCost: 42.18, callCount: 340, byAgent: {...} }
```

### 6.3 Cardinality guard
Unbounded free-form keys risk turning `group by` queries slow or meaningless (e.g. a unique ID tagged per call). v1: no indexing by default, `.query()` scans directly — sufficient at expected v1 volume. Explicit per-key indexing is a v2 concern, introduced only once a team's dataset requires it.
---
## 7. Storage Engine
**Decision: TimescaleDB (Postgres).** Not ClickHouse.
Rationale:
- Workload is append-only events at moderate volume (thousands–low millions/month for a typical self-hosted team), queried via simple time-bucketed sum/count grouped by a handful of metadata dimensions. Not high-cardinality analytics-at-scale.
- Postgres is already present in most teams' stacks. Requiring ClickHouse as a dependency contradicts the "easiest DX, one line, zero new infra" principle this SDK is built on.
- Continuous aggregates map directly onto the section 6.2 query shape (sum spend by dimension, by time bucket) without a hand-built rollup pipeline.
- `metadata` (section 6.1) is natively JSONB with GIN indexing — no schema migration per new metadata key.
- Budgets, agents, and tool caps are relational data; co-locating with the event table avoids splitting state across two database engines.
Revisit only if Caplytics becomes a hosted, multi-tenant product aggregating spend across many customers' fleets at genuine analytics-at-scale volume — not a v1 concern. The event schema (section 3) is engine-agnostic; this decision does not lock in the design.
---
## 8. Dashboard
Next.js app, shadcn components, for viewing and filtering spend events. Ships as v1, alongside the SDK.
### 8.1 Package split
The dashboard is a separate app from the SDK — not an npm dependency of agent code.

```
caplytics            → the SDK (attach, hooks, budget enforcement) — no Next.js/React deps
@caplytics/core       → shared: event schema, query() logic, DB client — imported by both
caplytics-dashboard   → the Next.js app — imports @caplytics/core, never redefines query logic
```

One query layer, two consumers. Dashboard schema drift is prevented by construction, not by convention.
### 8.2 Layout
Single page. No summary cards — aggregate totals are visible from the table itself.
- Filter bar: date range, agent (`Combobox`, populated from distinct `agentId` values), generic metadata key/value filter (arbitrary keys per section 6, not fixed dropdowns)
- Data table: paginated, sortable, one row per `CaplyticsEvent`
### 8.3 Component mapping
| UI element | shadcn component |
|---|---|
| Data table | `data-table` pattern (Table + TanStack Table) |
| Date range | `Popover` + `Calendar` (range mode) |
| Agent filter | `Combobox` |
| Metadata filter | Free-text key/value input → removable `Badge` chips |
| Loading state | `Skeleton` |
| Unknown-price rows | `Badge` ("price unknown"), tied to `priceUnknown` flag |
### 8.4 Data flow
Filters change → Server Action / Route Handler calls `@caplytics/core`'s `query()` (section 6.2) directly → table re-renders. Filter bar state maps onto `query()`'s argument shape unmodified — no separate dashboard-side filter schema.
Live-streaming updates (piping `.on()` into the UI via websocket/SSE) is explicitly out of v1 scope.
### 8.5 Pagination — cursor-based, not offset
Keyset pagination on `timestamp`: `WHERE timestamp < :cursor ORDER BY timestamp DESC LIMIT 50`.
Offset pagination degrades on a continuously growing, append-only table (cost scales with offset depth) and produces skipped/duplicated rows when new events insert mid-browse. Cursor pagination avoids both and needs no extra index — `timestamp` is already the hypertable partition key.
### 8.6 Auth — Google sign-in
OAuth via Google only for v1 (e.g. Auth.js). No password-based auth, no RBAC — any authenticated Google account with access can view all data. Sufficient for a single-team internal tool; per-role access control is out of scope for v1.
### 8.7 Distribution — Docker image
Ships as a Docker image in the open-source repo. Not an npm package, not `npx`.

```bash
docker run \
  -e DATABASE_URL=postgres://... \
  -e GOOGLE_CLIENT_ID=... \
  -e GOOGLE_CLIENT_SECRET=... \
  -p 3000:3000 \
  caplytics/dashboard
```

No build step, no local Next.js setup required to run it.
---
## 9. Implementation Standards
Applies to every package in the monorepo (`caplytics`, `@caplytics/core`, `caplytics-dashboard`) without exception.
### 9.1 Repo structure
- **Bun monorepo.** Single `bun install` at root, workspace packages under `packages/`.
- **`CLAUDE.md` at root and in every package.** Root file covers cross-cutting conventions (this section). Each package's file covers only what's specific to that package — do not duplicate root conventions inside package-level files.
- **`architecture/` folder at root**, one file per architectural decision, named `abc-xyz.md` (e.g. `budget-key-inference.md`, `storage-engine-choice.md`). Each file documents one decision: the decision, the rationale, the alternatives considered. This document (`caplytics-architecture.md`) is the index; individual `architecture/*.md` files are the detail record for each decision as it's implemented. Do not let both drift — this document links out, it does not duplicate.
### 9.2 Types
No `any`. No `unknown` left unnarrowed. Every external boundary (API response, DB row, env var) is validated and narrowed to a concrete type at the boundary — not passed inward as `unknown` and narrowed ad hoc at each usage site.
### 9.3 React / UI
- shadcn components for all UI. No custom-built equivalents of components shadcn already provides.
- Skeleton loaders only. No spinners, anywhere, for any loading state.
- `useEffect` is not a default tool. Reach for it only for genuine synchronization with an external system (subscriptions, non-React APIs). Derived state, data fetching, and event responses are not `useEffect` use cases — use server actions, derived values, or event handlers instead.
### 9.4 File and code organization
- One responsibility per file. A file that both defines a type and implements business logic and renders UI is three files.
- File and function names describe the one thing they do. If a name needs "and" to describe it, split it.
- DRY: no duplicated logic — this doc's own principle (infer over duplicate, section 2.2) applies equally to the codebase itself, not just the API design.
- KISS: prefer the boring solution. A clever abstraction introduced for a single call site is not justified until a second call site exists.
### 9.5 Comments
Comments explain **why**, never **what**. Code that needs a comment to explain what it does should be rewritten to be self-evident instead. Short. No comment blocks narrating a function line by line.

```ts
// Good: explains why
// Retry once — provider API occasionally returns a transient 503 on first call after idle.
await retry(fetchPricing, { attempts: 2 });
// Bad: explains what (redundant with the code itself)
// Loop through the array and check each item
for (const item of items) { ... }
```

### 9.6 Testing
No code merges without unit tests and spec tests covering it. Every package's `CLAUDE.md` states its test runner and coverage expectations explicitly — do not assume a shared default across packages without stating it.
### 9.7 Readability bar
A new engineer with no prior context on this codebase should be able to open any file and understand its purpose without reading the rest of the repo first. This is the standard implementation is judged against — not "does it work," but "is it obvious how and why it works."
### 9.8 PR structure
Implementation ships as stacked, logical PRs. One PR = one responsibility — never a PR that implements more than one section of this document at a time (e.g. budget enforcement and observability are separate PRs, even though they share the same interception point). Each PR is concise, independently reviewable, and states which section(s) of this document it implements. Stack order follows dependency order (e.g. section 1's interception model before section 4's hard stop, since hard stop has nothing to intercept without it).
---
## 10. Open Items Before Implementation
1. Confirm `Agent<T1, T2, T3>` generic slot ordering in current Mastra `.d.ts` for `ToolNames<T>` inference.
2. Decide default `onLimit` for v1 (`"warn"` recommended — a new tool should never silently kill a first run).
3. Confirm whether Mastra's model router supports abort mid-generation for the abort-based mid-stream stop; if not, section 4.2 is deferred to v2.
4. Define default cap when none is configured (must exist — zero-config should still enforce something, not silently no-op).
5. Define minimum TimescaleDB schema (hypertable on `CaplyticsEvent`, chunk interval, continuous aggregate definitions) before v1 implementation begins.
6. Confirm which Google Workspace domain(s), if any, should be allowlisted for dashboard sign-in, or whether any Google account is accepted for v1.
