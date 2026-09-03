import type { AnyAgent } from "./agent-types.js";

/**
 * Mastra's tool map has no public setter, so wrapping tool execution needs two `@internal` methods:
 * `__getOverridableFields()` to read the original tools, and `__setTools()` to install the wrapper.
 *
 * Both are read through this one module so the coupling is visible in a single place, and checked
 * before use so an incompatible Mastra fails loudly at `attach()` rather than silently leaving tool
 * spend untracked. See architecture/mastra-internal-api-coupling.md.
 */
type MastraInternals = {
  __getOverridableFields(): { tools: unknown };
  __setTools(tools: unknown): void;
};

export type ToolsAccessor = {
  /** The tools argument as originally configured — an object, or a function resolved per call. */
  readonly original: unknown;
  install(resolver: (context: unknown) => Promise<Record<string, unknown>>): void;
};

export function toolsAccessor(agent: AnyAgent): ToolsAccessor {
  const internals = agent as unknown as Partial<MastraInternals>;

  if (
    typeof internals.__getOverridableFields !== "function" ||
    typeof internals.__setTools !== "function"
  ) {
    // Degrading to model-only interception would under-report every tool call, which is worse than
    // refusing to attach: a budget that quietly stops counting is indistinguishable from one that
    // is simply not being spent.
    throw new Error(
      "caplytics: this version of @mastra/core does not expose the tool hooks caplytics needs " +
        "(__getOverridableFields / __setTools). Tool spend could not be tracked, so attach() " +
        "refuses rather than under-reporting. Please open an issue with your @mastra/core version.",
    );
  }

  // Captured before `install` replaces it — reading it afterwards would resolve our own wrapper and
  // recurse forever.
  const original = internals.__getOverridableFields().tools;

  return {
    original,
    install(resolver) {
      internals.__setTools?.(resolver);
    },
  };
}

/** Mastra's `DynamicArgument<T>`: either the value, or a function of the request context. */
export async function resolveDynamic<T>(value: unknown, context: unknown): Promise<T> {
  return typeof value === "function"
    ? await (value as (c: unknown) => Promise<T> | T)(context)
    : (value as T);
}
