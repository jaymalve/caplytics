# Wrapping tools requires two of Mastra's `@internal` methods

**Implements:** §1
**Status:** Accepted
**Verified against:** `@mastra/core@1.55.0`

## Decision

`attach()` installs the tool interception point using two methods Mastra marks `@internal`:

| Method | Why it is needed |
|---|---|
| `__getOverridableFields()` | Reads the tools argument *as originally configured*, before caplytics replaces it |
| `__setTools()` | Installs the wrapping resolver |

Both are reached through one module, `adapters/mastra/mastra-internals.ts`, and both are checked for
existence before use. An incompatible Mastra makes `attach()` throw with a message naming the
missing methods.

The model interception point needs no internal API: `model` is a public, assignable field typed
`DynamicArgument<...>`, so a per-call resolver installs cleanly.

## Rationale

Mastra exposes `listTools()` for reading tools but no public setter. §1 requires interception with
"no changes to agent construction, tool definitions, or downstream code", so wrapping at
construction time is not available — `attach()` receives an already-built agent.

Three alternatives were rejected before reaching for internal API:

- **Mutating the user's tool objects in place.** Tools are frequently shared across agents, so
  wrapping one would leak into every other agent using it and double-count its spend.
- **`__fork()`**, which returns an independently mutable clone. Its declared return type is
  `Agent<TAgentId, TTools, TOutput, TRequestContext>` — four slots where the class has five. Forking
  silently widens `TEditor`, breaking the same-`T` guarantee that §1 exists to protect.
- **Resolving tools once at attach time** via `await agent.listTools()`. This would force `attach()`
  to become async, changing §1's synchronous `export const agent = caplytics.attach(...)` shape, and
  would freeze function-based tools that Mastra otherwise resolves per request.

Reading the original argument through `__getOverridableFields()` rather than `listTools()` is not a
preference: after `__setTools()` installs the wrapper, `listTools()` resolves *that*, so a resolver
built on it would recurse until the stack overflowed.

## Consequences

**A Mastra major version can break tool tracking**, which is why the peer dependency is `^1.55.0`
rather than `>=1.55.0` — a range that admits 2.x would promise a compatibility that the internal
coupling cannot deliver.

**Failure is loud and immediate.** If either method is missing, `attach()` throws at setup rather
than continuing with model-only interception. Degrading silently would under-report every tool call,
and a budget that has quietly stopped counting is indistinguishable from one that is simply not
being spent — the worst possible failure for a spend-control tool.

`attach()` **mutates the agent it is given** and returns the same instance. This is what makes the
same-`T` guarantee trivially true: there is no clone whose generics could drift. §1's usage wraps
construction inline, so the mutation is not observable in the documented pattern.

## Alternatives if this becomes untenable

Upstreaming a public tool-wrapping hook to Mastra is the durable fix. Until then, the capability
check is the contract: it converts an upstream change from silent under-reporting into a failed
`attach()` with an actionable message.
