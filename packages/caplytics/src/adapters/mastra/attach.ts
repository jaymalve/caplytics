import { ModelRouterLanguageModel } from "@mastra/core/llm";
import { type ModelCallHooks, proxyLanguageModel } from "../../model/proxy-language-model.js";
import type { AnyAgent, CaplyticsConfig } from "./agent-types.js";
import { resolveDynamic, toolsAccessor } from "./mastra-internals.js";
import { type ToolExecutionHooks, wrapToolMap } from "./wrap-tool-map.js";

/**
 * What every interception carries: which pool the call draws on.
 *
 * The budget key is resolved once at attach time and threaded through both interception points, so
 * a consumer never has to rediscover it from an agent id that may deliberately differ (§2.2).
 */
export type InterceptionScope = {
  readonly budgetKey: string;
};

export type AttachHooks = {
  onModelCall?: (info: {
    readonly scope: InterceptionScope;
    readonly modelId: string;
    readonly method: "doGenerate" | "doStream";
  }) => void;
  onModelResult?: (info: {
    readonly scope: InterceptionScope;
    readonly modelId: string;
    readonly result: unknown;
  }) => void;
  onModelError?: (info: {
    readonly scope: InterceptionScope;
    readonly modelId: string;
    readonly error: unknown;
  }) => void;
  onToolCall?: (info: { readonly scope: InterceptionScope; readonly toolName: string }) => void;
  onToolResult?: (info: {
    readonly scope: InterceptionScope;
    readonly toolName: string;
    readonly result: unknown;
  }) => void;
  onToolError?: (info: {
    readonly scope: InterceptionScope;
    readonly toolName: string;
    readonly error: unknown;
  }) => void;
};

/**
 * Installs caplytics' two interception points on an agent (§1) and returns it unchanged.
 *
 * The return type is the agent's own `T`, not a widened `Agent<any>`: downstream consumers keep
 * full inference, and nothing is bolted onto the instance that could collide with Mastra's surface.
 * That is achieved by returning the *same* instance — the model field is reassigned and the tool
 * map is wrapped in place, so there is no clone whose generics could drift.
 *
 * Both interception points are pass-through here. Cost, enforcement and degradation are layered
 * onto these hooks by later work; this seam is deliberately invisible on its own.
 */
export function attach<T extends AnyAgent>(
  agent: T,
  config: CaplyticsConfig<T> = {},
  hooks: AttachHooks = {},
): T {
  const scope: InterceptionScope = { budgetKey: budgetKeyFor(agent, config) };

  // Read before installing anything: both resolvers close over the originals, and reading them
  // afterwards would resolve caplytics' own wrappers and recurse.
  const originalModel = agent.model;
  const tools = toolsAccessor(agent);

  agent.model = async (context: unknown) => {
    const resolved = await resolveDynamic<unknown>(originalModel, context);
    return proxyResolvedModel(resolved, modelHooks(scope, hooks)) as never;
  };

  tools.install(async (context) => {
    const resolved = await resolveDynamic<Record<string, unknown>>(tools.original, context);
    return wrapToolMap(resolved, toolHooks(scope, hooks));
  });

  return agent;
}

/** §2.2: `agent.id` is already required at construction, so a second string would only drift. */
export function budgetKeyFor<T extends AnyAgent>(agent: T, config: CaplyticsConfig<T>): string {
  return config.budget ?? agent.id;
}

// The proxy and tool wrapper are framework-agnostic and know nothing about budgets; the scope is
// bound in here so they stay reusable by a second adapter.
function modelHooks(scope: InterceptionScope, hooks: AttachHooks): ModelCallHooks {
  return {
    onCallStart: ({ modelId, method }) => hooks.onModelCall?.({ scope, modelId, method }),
    onCallFinish: ({ modelId, result }) => hooks.onModelResult?.({ scope, modelId, result }),
    onCallError: ({ modelId, error }) => hooks.onModelError?.({ scope, modelId, error }),
  };
}

function toolHooks(scope: InterceptionScope, hooks: AttachHooks): ToolExecutionHooks {
  return {
    onToolStart: ({ toolName }) => hooks.onToolCall?.({ scope, toolName }),
    onToolFinish: ({ toolName, result }) => hooks.onToolResult?.({ scope, toolName, result }),
    onToolError: ({ toolName, error }) => hooks.onToolError?.({ scope, toolName, error }),
  };
}

/**
 * Turns whatever the model field resolved to into something proxyable.
 *
 * A model id string is constructed into a router instance first, because a string offers nothing to
 * intercept — that is precisely the limitation architecture/model-proxy-over-string-swap.md
 * describes. Shapes with no single underlying model (fallback lists, retry arrays) are returned
 * untouched rather than guessed at.
 */
function proxyResolvedModel(resolved: unknown, hooks: ModelCallHooks): unknown {
  if (typeof resolved === "string") {
    return proxyLanguageModel(new ModelRouterLanguageModel(resolved), hooks);
  }

  if (isLanguageModel(resolved)) {
    return proxyLanguageModel(resolved, hooks);
  }

  return resolved;
}

function isLanguageModel(value: unknown): value is object {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, "doGenerate") === "function"
  );
}
