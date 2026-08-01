# caplytics

The published SDK: `attach()`, enforcement, and framework adapters. Root [CLAUDE.md](../../CLAUDE.md) covers everything not specific to this package.

## The rule that defines this package

**`attach()` returns the same type it was given.** Not `Agent<any>`, not `T & { caplytics: ... }`. Downstream consumers keep full inference, and Mastra cannot collide with a surface we bolted onto its instances. Any change here needs a type test proving inference survives — see §1 and §3 of [IMPLEMENTATION.md](../../IMPLEMENTATION.md).

There are exactly **two** interception points, per §1: the per-call model resolver, and each tool's `execute()`. Adding a third — wrapping `.generate()`, hijacking `onStepFinish` — is the change this package exists to avoid. If something seems to need one, the answer is usually the model proxy: see [architecture/model-proxy-over-string-swap.md](../../architecture/model-proxy-over-string-swap.md).

## Framework coupling

`@mastra/core` is an **optional peer dependency**, and Mastra-specific code stays under `src/adapters/mastra/`. Nothing outside that directory may import it. Framework-agnostic machinery — run context, budget wiring, event emission — lives outside, so a second adapter is a new directory rather than a refactor.

## Run identity

Mastra's model resolver receives only `{ requestContext, mastra }` — no `runId`, no step. Correlating a model call with its run, and a tool call with the model call that follows it, uses `AsyncLocalStorage`. This is load-bearing, not incidental: `CaplyticsEvent.runId` cannot be populated without it. Do not replace it with a module-level mutable "current run" — concurrent runs in one process would interleave and silently mis-attribute spend.

## Tests

Runner: `bun test`. Colocated as `src/thing.test.ts`.

Behavior is tested against a stub `LanguageModel` implementing the AI SDK interface — never against a live provider. CI has no API keys and must never need them.

Two things need explicit coverage beyond the usual, because they are the guarantees users rely on:

- **Type-level:** tool-name narrowing, literal `agent.id`, and same-`T` return, asserted with `@ts-expect-error`.
- **Concurrency:** parallel tool calls must not over-spend a cap. A ledger race is the failure mode that silently costs real money.
