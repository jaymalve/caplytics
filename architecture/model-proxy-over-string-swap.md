# The model resolver returns a proxy model, not a model string

**Implements:** §1, §3, §4.2, §5
**Status:** Accepted

## Decision

The per-call model resolver returns a **`LanguageModel` proxy object** that wraps the resolved underlying model. It does not return a model ID string.

§1 says the resolver "replaces the model string with a resolver function." That remains true — what changes is the resolver's *return value*, not the interception point. `MastraModelConfig` already admits `LanguageModelV2 | V3 | V4` objects alongside `ModelRouterModelId` strings, so this needs no cooperation from Mastra.

## Rationale

Returning a string satisfies §5 alone. Three separate requirements are unimplementable without a proxy, and all three collapse into this one mechanism:

| Requirement | Why a string fails | What the proxy does |
|---|---|---|
| §4.2 mid-stream abort | `abortSignal` lives on caller-supplied execution options; `attach()` does not control call sites | Proxy owns an `AbortController` inside its own `doStream` |
| §3 usage capture | A string yields no hook on the response | Proxy reads `usage` off the `doGenerate` / `doStream` result at source, including the `cacheRead` / `cacheWrite` breakdown |
| §5 model swap | Works with a string | Proxy delegates to a different underlying model |

One mechanism, three features, and §1's "two, and only two" rule survives intact. A string-returning resolver would have forced a `.generate()` wrapper for abort and an `onStepFinish` hijack for usage — two extra interception points to cover what one proxy covers.

The proxy is also the seam that makes §-level framework independence real: it implements the AI SDK `LanguageModel` interface, not a Mastra interface, so the v2+ adapters mentioned in the preamble reuse it unchanged.

## Consequences

- Caplytics must resolve a model ID string to a `LanguageModel` instance in order to wrap it. `ModelRouterLanguageModel` is exported from `@mastra/core` and implements `MastraLanguageModelV2`, so this is a construction, not a reimplementation of provider routing.
- The proxy must pass through `specificationVersion`, `provider`, `modelId`, and `supportedUrls` faithfully. `modelId` in particular must report the **downgraded** model when §5 swaps, so §3 events and any Mastra-side telemetry agree on what actually ran.
- Mastra accepts spec versions V1 through V4. The proxy is written against one version and version-adapted at the edge, rather than branching internally.

## Alternatives considered

- **Return a model ID string; wrap `.generate()` for abort** — rejected. Third interception point, and it misses every non-`.generate()` execution path.
- **Return a string; take usage from `onStepFinish`** — rejected. Single-slot callback, clobbers the user's own, and reports per *step* rather than per model call, which is the wrong granularity for §3's one-event-per-call guarantee.
