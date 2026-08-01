# Tool cost is declared external cost; result tokens are attribution only

**Implements:** §1, §3
**Status:** Superseded in part by the correction below — the derivation double-counted

## Correction (PR 7): the derived token cost must not consume budget

The design below charged a tool for the tokens its result adds to context. That double-counts.

Those same tokens are billed by the provider as **input on the following model call**, which
caplytics already prices in full from real usage. Charging them again on the tool event would make
total recorded spend exceed the provider's invoice — the one thing a cost tracker must never do,
and a direct violation of §4.2's rule against false precision.

What ships instead:

- **Model calls carry the full provider cost.** Nothing is netted out of them, so a caplytics event
  and the provider's own usage figures agree for that call.
- **Tool calls consume budget only for `cost`** — external pricing (a paid API, a payment moved)
  that no instrumentation can observe and that the provider never bills.
- **Result tokens are reported on the tool event's `tokensIn`**, for attribution rather than
  charge. A chatty tool is still visible, and still caught by enforcement — its payload inflates the
  model call that reads it, where the money is actually spent.

The estimate/reconcile machinery below is therefore unnecessary: there is nothing to reconcile once
tool token cost is not a charge. `priceToolResult` was removed and replaced by `toolResultTokens`.

The rationale for *deriving* rather than hardcoding still stands — it is the accounting that moved,
not the measurement.

## Decision

A `tool_call` event's cost is **derived from the token cost of the tool's result**, priced at the parent model's input rate. No configuration is required for the common case.

An optional `cost` field covers external pricing that no instrumentation can observe:

```ts
tools: {
  searchDocsTool: { cap: 1.00 },                 // cost derived from result tokens
  refundTool:     { cap: 1.00, cost: 0.005 },    // + external per-call API price
}
```

Tools with neither derived nor declared cost emit `priceUnknown: true` and consume no budget.

## Rationale

§2.1 gives tools a `cap` but never defines what a tool call costs. Three distinct things were conflated:

1. **Tool definition tokens** — every tool's JSON schema is serialized into the prompt on every model call. Real, but paid whether or not the tool fires, and billed as part of the model call. Attributing it to a `tool_call` would double-count. Not attributed.
2. **Tool result tokens** — the tool's return payload becomes input tokens on the next model call. A tool returning 50KB of JSON genuinely costs money. **This is the dominant tool cost and it is derivable.**
3. **External API cost** — a search API at $0.005/query, or a refund tool moving real money. No provider reports this and no instrumentation recovers it. Declaration is the only option.

Hardcoding a flat number for (2) would be both wrong and unnecessary: no provider exposes a per-tool usage line item, but per-step usage *is* available, and the arithmetic closes.

## How the derivation works

This is what the `costEstimate` / `costActual` split in §3 is for; until now it had no reason to exist.

- **`costEstimate`** — emitted immediately when the tool returns, from a local token count of the serialized result priced at the parent model's input rate. Available in time for the pre-call budget check on the *next* call.
- **`costActual`** — reconciled once the next model call reports real usage:

  ```
  toolResultTokens ≈ inputTokens[n] − inputTokens[n−1] − outputTokens[n−1]
  ```

  A runtime probe confirmed every term is present per step. Pricing uses the `inputTokens: { noCache, cacheRead, cacheWrite }` breakdown, since cached reads are billed at a fraction of fresh input.

Reconciliation is best-effort. When prompt caching, memory compaction, or a system-prompt change makes the delta unattributable, `costActual` keeps the estimate and the event is flagged. Silently reporting a bad subtraction as measured truth would violate §4.2's "do not present false precision" — which applies to costing generally, not only to stop messages.

A useful property falls out for free: chatty tools that dump large payloads into context are charged for it, and hit their `cap` accordingly, with no one having to guess a number.

## Alternatives considered

- **Flat user-declared cost per tool** — rejected as the default. Every user would have to invent a number, and it would be wrong the moment a tool's payload size changed.
- **Tools cost only what their nested model calls cost** — rejected. `refundTool: { cap: 1.00 }` from §2.1's own example would then cap nothing at all for a plain API-calling tool.
- **Tokenize the result and stop there (no reconciliation)** — rejected. Leaves `costActual` permanently equal to `costEstimate`, making the §3 schema's two-field split dishonest.
