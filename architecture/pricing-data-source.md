# Model prices come from a live feed, not from the package

**Implements:** §3
**Status:** Accepted — supersedes the hand-written rate table

## Decision

Model rates are fetched at runtime from LiteLLM's published
`model_prices_and_context_window.json` (BerriAI/LiteLLM, MIT) and cached in memory. No rates are
compiled into the package, and no vendor cache multipliers appear anywhere in the codebase.

Retrieval sits behind a `PriceSource` interface in the SDK. `@caplytics/core` keeps only the pure
half: validating the feed into a `PriceTable`, resolving a model id against it, and pricing usage.

## Rationale

The first implementation hardcoded per-model rates and derived cache rates from Anthropic's
published multipliers (read 0.1x, write 1.25x at 5m / 2x at 1h). Those numbers were correct — the
feed's explicit values match them exactly — but the approach does not survive contact with reality:

- Every price change and every new model needs a package release. Between releases, a cost tracker
  reports confidently wrong numbers, which is worse than reporting none.
- The multipliers are vendor-specific. A second provider means a second set of constants, and a
  third means a third, each maintained by hand and each wrong the moment that vendor re-prices.

The feed removes both problems at once: it publishes `cache_read_input_token_cost`,
`cache_creation_input_token_cost`, and `cache_creation_input_token_cost_above_1hr` **per model**, so
the cache tiers are read rather than derived. It covers 2175 priced chat models across every major
provider, which matters because the framework routes to more than one.

It also tracks *current* effective pricing rather than list pricing — it quotes Sonnet 5 at its
introductory rate while that rate is in force. That is what retired the hand-maintained
effective-dated table: encoding date windows only works for changes someone knows about in advance,
which is the manual upkeep this decision exists to remove.

## Consequences

**Pricing now depends on reachability, and that is the real cost of this decision.** A process that
cannot reach the feed and has nothing cached prices every call `priceUnknown`, and unpriced calls
consume no budget — so spend control silently stops enforcing while the agent keeps running. That is
a fail-open on the product's core safety feature, and it is mitigated, not eliminated:

- The first lookup in a process **awaits** the fetch rather than firing it in the background, so a
  run never begins with no prices at all.
- A failed refresh keeps serving the last good table. Stale rates beat no rates.
- A 200 response that prices nothing is treated as a failure, so an empty body cannot cache as
  "no model has a price" and disable enforcement until the TTL expires.
- Failure warns loudly once, naming the consequence, rather than degrading quietly.

Deliberately **not** bundling a snapshot as a floor: a snapshot is wrong from the day it is cut and
goes stale silently, which is the failure this decision set out to avoid. `PriceSource` is an
interface precisely so an air-gapped deployment can supply a local table without any change here.

A malformed entry is skipped rather than throwing, so one bad row cannot cost every other model its
price. The feed is validated at the boundary (§9.2) before any of it reaches the ledger.

Rates are converted to integer micro-dollars on the way in. The feed quotes dollars per single
token as floats small enough to carry visible binary error — a $0.20/M cache read arrives as
`2e-7`, which does not multiply back to exactly `200000`.

## Alternatives considered

- **Hand-written rate table** — the original implementation. Rejected: unmaintainable, and stale
  between releases in a tool whose entire value is accurate cost.
- **Bundled snapshot, refreshed on upgrade** — rejected. Deterministic and offline-safe, but
  reintroduces silent staleness as the default state.
- **Bundled snapshot as a fallback floor only** — rejected for the same reason; the floor is the
  path taken exactly when nobody is watching.
- **Querying each provider's own pricing API** — no provider publishes machine-readable pricing.
  The Models API exposes capabilities and context windows, not rates.
