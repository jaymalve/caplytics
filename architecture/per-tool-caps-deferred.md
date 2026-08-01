# Per-tool caps are declared but not enforced

**Relates to:** §2.1
**Status:** Open — deferred to hands-on testing, not yet decided

## Current state

`tools: { refundTool: { cap: 1.00 } }` type-checks, and the tool name is constrained to the agent's
own tool map (§2.1 works). The `cap` value is **not enforced**. Nothing reads it.

## Why this needs deciding rather than implementing

PR 7 corrected a double-count: a tool's result tokens are billed by the provider as input on the
*following* model call, which caplytics already prices in full, so a tool consumes budget only for
declared external cost (`cost`). See [tool-cost-derivation.md](tool-cost-derivation.md).

That changes what a per-tool cap can mean:

- For a tool with a declared `cost`, a cap is meaningful — it bounds how much of that external spend
  the tool may incur in a run.
- For a tool **without** one — the common case — the tool's recorded cost is zero, so a cap can
  never trip. It would be configuration that silently does nothing, which is the failure mode this
  project keeps refusing to ship.

§2.1 was written before that correction, and probably assumed a tool cap would bound the tool's
token contribution. Under the corrected accounting it cannot, because that contribution is charged
to the model call that reads it.

## What to settle

1. Does a tool cap bound only declared external cost, and is that useful enough to keep?
2. Or should it bound the tool's *attributed* token contribution — accepting that this is an
   attribution figure that does not sum with the model-call charges, and cannot be enforced without
   reintroducing the double-count?
3. Or is a per-tool cap the wrong shape entirely now, and should it be removed from the config
   surface rather than left inert?

Option 3 is a real candidate. Leaving a cap that never fires is worse than not offering one.

Enforcement also needs a second pool dimension keyed by `(runId, budgetKey, toolName)`, which the
ledger supports but nothing currently opens.
