# Per-run caps need a caller-supplied run boundary

**Implements:** §1, §4
**Status:** Accepted — adds public API not anticipated by IMPLEMENTATION.md
**Verified against:** `@mastra/core@1.55.0`

## Decision

`caplytics.run(fn)` and `caplytics.context(metadata)` are added to the public surface. Either one
groups a sequence of model and tool calls into a single run, which is what a per-run cap bounds.

Neither is an interception point. §1's rule that there are exactly two remains intact.

## Rationale

Caps are per-run (architecture/budget-scope-and-state.md). A run spans several model calls, so
enforcement needs to know which calls belong together — but §1 permits no interception point that
could bracket `.generate()`, and the two that exist fire *inside* a run, not around it.

Three mechanisms were probed against the real Mastra runtime:

| Mechanism | Result |
|---|---|
| `RequestContext` object identity | Unusable — Mastra rebuilds the instance for every model call, even within one run |
| Caller-set entries on `requestContext` | Works — entries survive into every model call in the run |
| `AsyncLocalStorage` around `.generate()` | Works — the model resolver runs in the same async context |

Both working mechanisms require the caller to supply something. There is no zero-config way to
recover a run boundary from inside the two interception points.

## Consequences

Run identity resolves in a fixed order: `AsyncLocalStorage`, then `requestContext`, then a per-call
fallback.

**The fallback warns rather than pretending.** Without a boundary, every call would receive a fresh
allowance while still looking like enforcement — a cap that silently never fires is worse than no
cap, because it is indistinguishable from one that is simply not being reached. Cost tracking and
event emission are unaffected; only grouping and capping are.

This diverges from §1's one-line promise: `attach()` alone tracks spend but cannot cap it. The
alternative was wrapping `.generate()`, which §1 forbids and which would have to be repeated for
every other Mastra entry point (workflows, networks, Studio) and would drift between them.

## Alternatives considered

- **Wrap `.generate()`** — rejected. Adds the third interception point the SDK is designed around
  not having, and covers only one of several execution paths.
- **Require a run wrapper whenever `cap` is set** — rejected. Enforcement would never be silently
  absent, but every existing call site would have to change before spend tracking worked at all.
- **Redefine `cap` as per-model-call** — rejected. A runaway multi-step agent loop, the main thing
  spend control exists to catch, would never trip a per-call cap.
