# Architecture Decision Record

[IMPLEMENTATION.md](../IMPLEMENTATION.md) is the index and states *what* Caplytics is. The files here are the detail record for each decision as it is implemented: the decision, the rationale, the alternatives considered.

Per §9.1, this document links out; it does not duplicate.

| Decision | Implements | Status |
|---|---|---|
| [mastra-interception-points.md](mastra-interception-points.md) | §1, §2 | Verified against `@mastra/core@1.55.0` |
| [model-proxy-over-string-swap.md](model-proxy-over-string-swap.md) | §1, §3, §4.2, §5 | Accepted |
| [per-call-metadata-transport.md](per-call-metadata-transport.md) | §6.1 | Accepted — amends §6.1 |
| [tool-cost-derivation.md](tool-cost-derivation.md) | §1, §3 | Accepted — fills a §2.1 gap |
| [budget-scope-and-state.md](budget-scope-and-state.md) | §4, §5 | Accepted — fills a §4 gap |
| [core-subpath-exports.md](core-subpath-exports.md) | §8.1 | Accepted — refines §8.1 |
| [event-schema-completions.md](event-schema-completions.md) | §3 | Accepted — completes §3 |
| [pricing-data-source.md](pricing-data-source.md) | §3 | Accepted — supersedes the hand-written rate table |
| [mastra-internal-api-coupling.md](mastra-internal-api-coupling.md) | §1 | Accepted |
| [run-scoping-api.md](run-scoping-api.md) | §1, §4 | Accepted — adds public API |
| [per-tool-caps-deferred.md](per-tool-caps-deferred.md) | §2.1 | **Open** — deferred, not yet decided |
| [query-layer-integration-gap.md](query-layer-integration-gap.md) | §6.2, §8.5 | Resolved — integration harness uses pg |
| [table-sorting-and-cursors.md](table-sorting-and-cursors.md) | §8.2, §8.5 | Accepted — narrows §8.2 |
| [one-click-self-host.md](one-click-self-host.md) | §8.7 | Accepted — extends §8.7 |
| [dashboard-overview-layout.md](dashboard-overview-layout.md) | §8.2, §8.3 | Accepted — amends §8.2 |
| [landing-package.md](landing-package.md) | — | Accepted — adds a package not in IMPLEMENTATION.md |
