# Mastra interception points

**Implements:** §1, §2
**Resolves:** open items 1 and 3
**Verified against:** `@mastra/core@1.55.0`

## Decision

The two interception points in §1 are viable as specified. No third attachment point is required.

## Findings

### Generic slot ordering (open item 1 — resolved)

```ts
class Agent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext = unknown,
  TEditor = AgentEditorConfig | undefined
>
```

`TTools` is slot 2. §2.1's `ToolNames<T>` compiles **verbatim** — no `InferAgentTools<T>` fallback needed. A type probe confirmed that a misspelled tool name is a compile error, and that inference survives a `<T extends Agent<...>>(a: T) => T` wrapper.

`id: TAgentId` is preserved as a string *literal*, so §2.2's `config?.budget ?? agent.id` yields `"support-agent"`, not `string`. Budget keys are narrowly typed for free.

The constraint must be written `Agent<any, any, any, any, any>` — five slots, not three.

### Model resolver is invoked per model call (critical)

`model` accepts `DynamicArgument<MastraModelConfig, TRequestContext>`, i.e.
`T | (({ requestContext, mastra }) => T | Promise<T>)`.

A runtime probe over a two-step tool loop recorded **2 resolver invocations for 2 model calls** — the resolver fires per model call, not once per agent and not once per `.generate()`. Each invocation may return a *different* model.

§5's degradation ladder is therefore implementable exactly as designed, including moving between rungs mid-run.

### The resolver receives no run identity

The resolver's only argument is `{ requestContext, mastra }`. It does not receive `runId`, the message list, or the current step.

Consequence: correlating a model call with its run, and with the tool call that preceded it, requires `AsyncLocalStorage`. This is a requirement, not a convenience — see §3's `runId` field, which cannot otherwise be populated.

### Abort is available, but not from where §4.2 assumes (open item 3 — resolved)

`abortSignal` exists on `.generate()` / `.stream()` execution options, so mid-generation abort is supported. §4.2 is **not** deferred to v2.

However, those options are supplied by the *caller*. `attach()` does not control call sites, so it cannot inject a signal there without wrapping `.generate()` / `.stream()` — a third interception point, which §1 forbids.

Resolved by [model-proxy-over-string-swap.md](model-proxy-over-string-swap.md): the abort lives inside the model object the resolver returns.

### Per-step usage is available

`onStepFinish` reports `{ inputTokens, outputTokens, totalTokens }` per step, and the provider-level usage type carries an `inputTokens: { total, noCache, cacheRead, cacheWrite }` breakdown. Cache reads and cache writes are priced differently by providers, so costing must consume the breakdown rather than a flat `inputTokens` total.

`onStepFinish` also exists at agent-config level, not only per call — but it is a single-slot callback, so consuming it would silently clobber a user's own. Not used; the model proxy reads usage at source instead.

## Alternatives considered

- **Wrapping `.generate()` / `.stream()`** — rejected. Adds the third interception point §1 rules out, and Mastra has several other execution entry points (workflows, networks, Studio) that would each need the same treatment and would drift.
- **Agent-level `onStepFinish` for usage capture** — rejected. Single-slot callback; overwriting a user-supplied one to collect telemetry is a side effect `attach()` promises not to have.
