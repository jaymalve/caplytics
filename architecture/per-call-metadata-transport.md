# Per-call metadata travels via requestContext

**Implements:** §6.1
**Status:** Accepted in shape; **transport not yet functional** — see the open issue below

## Decision

Per-call metadata is passed through Mastra's `requestContext`, not through a `caplytics` key on the execution options.

```ts
// §6.1 as written — does not compile
await supportAgent.generate(messages, {
  caplytics: { metadata: { customerId: "cus_18213" } },
});

// As implemented
await supportAgent.generate(messages, {
  requestContext: caplytics.context({ customerId: "cus_18213", channel: "chat" }),
});
```

Agent-level metadata (`caplytics.attach(agent, { metadata: { category: "..." } })`) is unchanged. Merge semantics are unchanged: per-call merges over agent-level.

## Rationale

`AgentExecutionOptions` has no index signature. An unknown `caplytics` key is an excess-property error — verified: a type probe asserting the failure compiles clean, confirming the key is genuinely rejected. §6.1's API as written cannot ship.

`requestContext` is the idiomatic Mastra slot for caller-supplied per-call data, and it is **already threaded into the model resolver** (`DynamicArgument` receives `{ requestContext }`). Metadata therefore arrives at the exact point where §5 needs it and §3 emits from, with no extra plumbing.

The alternative — reaching Mastra's option types via declaration merging so `caplytics: {}` becomes legal — was rejected. It makes an SDK's type correctness depend on module augmentation resolving in the consumer's project, which fails silently under `skipLibCheck`, bundler re-exports, and monorepo hoisting. A wrong-looking API that always works beats a pretty one that intermittently does not.

## OPEN: the transport does not currently reach the interception points

The merge itself works and is tested — agent-level and run-level metadata reach every event, with
the more specific level winning. What does not work is reading metadata (or run identity) off a
caller-supplied `requestContext`.

What is known:

- A **raw** agent's resolver receives `{ requestContext, mastra }`, and a caller-set entry is
  readable from the inner `RequestContext` — verified directly.
- With `attach()` installed, the resolver instead receives a plain object with no `requestContext`
  property and no `get` method. Unwrapping therefore finds nothing.

So something about assigning `agent.model` after construction changes what Mastra passes the
resolver. This has been latent since PR 7: every test until now exercised the `AsyncLocalStorage`
rung of the ladder, which works, so the `requestContext` rung was never covered.

**Impact.** `caplytics.run()` is currently the only working way to scope a run or attach per-call
metadata. `caplytics.context()` builds a correct `RequestContext` — its contents read back fine in
isolation — but nothing downstream can see it. The fallback warning fires, so no caller is silently
misled; they are told per-run caps are not being enforced.

This needs isolating against Mastra's model-resolution path rather than patching by guesswork.

## Consequences

- `caplytics.context()` is a thin helper producing a `RequestContext` with metadata under a namespaced key, so it composes with a user's own `requestContext` entries rather than replacing them.
- Tool-call metadata still needs `AsyncLocalStorage` (see [mastra-interception-points.md](mastra-interception-points.md)) — wrapped `execute()` functions do not receive `requestContext` on the same argument shape the model resolver does.
- §6.1 in [IMPLEMENTATION.md](../IMPLEMENTATION.md) is now out of date on this point. It is deliberately left as-is: that document is the design record as written, and this file is the amendment. Per §9.1, the two link rather than duplicate.
