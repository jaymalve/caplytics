# Caplytics — repo conventions

Spend-control and cost tracking for AI agents. [IMPLEMENTATION.md](IMPLEMENTATION.md) is the design record and the source of truth for *what* to build; [architecture/](architecture/README.md) holds one file per decision, with rationale and alternatives.

This file covers conventions that apply everywhere. Package-level `CLAUDE.md` files cover only what is specific to that package — **do not repeat anything from here in them**.

## Layout

```
packages/core        → @caplytics/core   event schema, cost model, budget ledger, query layer
packages/caplytics   → caplytics         the SDK: attach(), enforcement, framework adapters
```

`caplytics-dashboard` (Next.js) arrives with the dashboard work in §8.

## Commands

| | |
|---|---|
| `bun install` | once, at root — workspaces are linked from here |
| `bun run verify` | lint → typecheck → build → test. **Run before every commit.** |
| `bun run format` | apply Biome formatting and safe fixes |
| `bun test` | tests only |

`build` must run before `test`: the packaging invariants in `test/` assert against real build output.

## Types (§9.2)

No `any`. No `unknown` left unnarrowed. Biome enforces `noExplicitAny` as an error.

Validate and narrow at every external boundary — API responses, DB rows, env vars — to a concrete type *at the boundary*. Never pass `unknown` inward to be narrowed ad hoc at each usage site.

Interfacing with a third-party type that is itself `any`-typed (Mastra's `Agent<any, ...>` generics) is the one exception. It needs a `biome-ignore` with a one-line reason naming the upstream type, not a blanket override.

Type-level behavior is tested with `@ts-expect-error` assertions inside normal `typecheck`, not a separate type-test runner. An unused `@ts-expect-error` is itself an error, so these assertions cannot silently rot.

## Files and naming (§9.4)

One responsibility per file. A file that defines a type *and* implements logic *and* renders UI is three files. If a file or function name needs "and" to describe it, split it.

DRY and KISS: prefer the boring solution; a clever abstraction for a single call site waits until there is a second call site.

## Comments (§9.5)

Explain **why**, never **what**. Code needing a comment to say what it does should be rewritten instead. Short. No line-by-line narration.

```ts
// Good — explains why
// Retry once: provider API returns a transient 503 on first call after idle.
await retry(fetchPricing, { attempts: 2 });
```

## Tests (§9.6)

Nothing merges without unit and spec tests covering it. Each package's `CLAUDE.md` names its own runner and coverage expectation — there is deliberately no repo-wide default to assume.

Tests are colocated: `src/thing.test.ts` next to `src/thing.ts`. Repo-wide invariants (packaging, boundaries) live in root `test/`.

## Readability bar (§9.7)

A new engineer opening any file should understand its purpose without reading the rest of the repo. The bar is not "does it work" but "is it obvious how and why it works."

## PRs (§9.8)

One PR = one responsibility, and never more than one section of IMPLEMENTATION.md at a time. Stacked in dependency order. Each PR states which section(s) it implements.

When a PR makes a decision that IMPLEMENTATION.md did not anticipate — or contradicts it — add a file to `architecture/` and link it from that index. Amend, don't silently diverge, and don't edit IMPLEMENTATION.md to match; it is the record as designed.
