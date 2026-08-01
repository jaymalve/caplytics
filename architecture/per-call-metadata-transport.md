# Per-call metadata travels via requestContext

**Implements:** §6.1
**Status:** Accepted — amends §6.1

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

## Resolved: the wrapper must be unwrapped before use

Mastra invokes a model resolver as `modelConfig({ requestContext, mastra })` — confirmed in
`resolveModelSelection` in `@mastra/core@1.55.0`. The resolver therefore receives a **wrapper**, not
the request context itself, and anything calling `.get()` on that wrapper finds nothing.

`attach()` briefly passed the wrapper straight through to both interception points. The tool path
was corrected; the model path was not, so run identity and per-call metadata could never be read
from a caller-supplied context. Both now unwrap.

This was latent from PR 7 until PR 12 because every test until then used the `AsyncLocalStorage`
rung of the run-identity ladder, which works regardless. The first test to exercise the
`requestContext` rung found it immediately — a reminder that a resolution ladder needs a test per
rung, not one test that happens to take the first branch.

## Consequences

- `caplytics.context()` is a thin helper producing a `RequestContext` with metadata under a namespaced key, so it composes with a user's own `requestContext` entries rather than replacing them.
- Tool-call metadata still needs `AsyncLocalStorage` (see [mastra-interception-points.md](mastra-interception-points.md)) — wrapped `execute()` functions do not receive `requestContext` on the same argument shape the model resolver does.
- §6.1 in [IMPLEMENTATION.md](../IMPLEMENTATION.md) is now out of date on this point. It is deliberately left as-is: that document is the design record as written, and this file is the amendment. Per §9.1, the two link rather than duplicate.
