# The persisted event carries `id` and `priceUnknown`

**Implements:** §3
**Status:** Accepted — completes §3

## Decision

`CaplyticsEvent` adds two required fields to the shape given in §3:

```ts
id: string;            // uuid
priceUnknown: boolean;
```

Money fields (`costEstimate`, `costActual`, `budgetRemaining`) are integer micro-dollars rather than `number` dollars.

## `priceUnknown`

§8.3 maps a dashboard Badge to "the `priceUnknown` flag," but §3's schema has no such field — an internal inconsistency, not a new requirement.

The flag is required, not optional, because the alternative is worse: a call whose model is missing from the pricing table would otherwise record `costActual: 0` and be indistinguishable from a genuinely free call. Spend would silently under-report, and a cap would never fire. Forcing every producer to state whether the price was known makes the unpriced case impossible to omit by accident.

Unpriced calls are reported but do not consume budget — there is no honest amount to deduct. §4.2's rule against false precision is what decides this: the cost is unknown, so it is labelled unknown rather than guessed at zero.

## `id`

§8.5 specifies keyset pagination as `WHERE timestamp < :cursor ORDER BY timestamp DESC LIMIT 50`.

On `timestamp` alone this is incorrect whenever two events share a timestamp — which is not an edge case here, since Mastra runs tool calls in parallel and their events are emitted in the same millisecond. If a page boundary falls inside such a group, `timestamp < :cursor` skips the remainder of it, and rows are lost from the listing.

A unique tiebreaker makes the cursor total: `WHERE (timestamp, id) < (:ts, :id) ORDER BY (timestamp, id) DESC`. This is what §8.5 was already trying to achieve — cursor pagination was chosen there precisely to avoid "skipped/duplicated rows," and it needs `id` to actually deliver that.

UUIDv4 rather than a database sequence, because the SDK creates events client-side and may batch them; an identifier that only exists after insert cannot be used by the emitter (§3) or correlated in logs.

## Money representation

§3 types costs as `number`. Stored as dollars in floating point, a run summing thousands of sub-cent calls accumulates representation error, and two code paths spending the same amount can disagree on whether a cap was reached.

Integer micro-dollars (1 USD = 1,000,000) make the ledger exact, keep SQL aggregates exact, and are branded in TypeScript so dollars cannot be passed where micro-dollars are expected. Conversion to a decimal happens only at display boundaries — `formatUsd()` and the §6.2 query result, which reports dollars as §6.2 specifies.

## Alternatives considered

- **`priceUnknown` optional, defaulting to false** — rejected. Makes the dangerous case the one you get by forgetting.
- **Deriving unknown price from `costActual === 0`** — rejected. Conflates "free" with "unmeasured", and a genuinely zero-cost cached call exists.
- **Cursor on `timestamp` alone, accepting the skips** — rejected. It defeats the stated reason §8.5 chose keyset pagination.
- **Storing dollars as `numeric` in Postgres and floats in TS** — rejected. The drift reappears the moment the SDK sums in memory to enforce a cap, which is the hot path.
