export type ToolExecutionHooks = {
  onToolStart?: (info: { readonly toolName: string }) => void;
  onToolFinish?: (info: { readonly toolName: string; readonly result: unknown }) => void;
  onToolError?: (info: { readonly toolName: string; readonly error: unknown }) => void;
};

/**
 * Wraps each tool's `execute` — the second and last interception point (§1).
 *
 * Each tool is proxied rather than shallow-copied. Mastra's tool map holds class instances and
 * provider-defined tools alongside plain objects; spreading one would drop its prototype, and
 * mutating it in place would leak the wrapper into every other agent sharing that tool.
 */
export function wrapToolMap(
  tools: Record<string, unknown>,
  hooks: ToolExecutionHooks = {},
): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};

  for (const [toolName, tool] of Object.entries(tools)) {
    wrapped[toolName] = wrapTool(toolName, tool, hooks);
  }

  return wrapped;
}

function wrapTool(toolName: string, tool: unknown, hooks: ToolExecutionHooks): unknown {
  if (tool === null || typeof tool !== "object") return tool;

  const execute = Reflect.get(tool, "execute", tool);
  // Provider-defined and placeholder tools run on the provider's side and have nothing to wrap.
  if (typeof execute !== "function") return tool;

  let bound: ((...args: unknown[]) => unknown) | undefined;

  return new Proxy(tool, {
    get(target, property) {
      if (property !== "execute") {
        // Target as receiver, so getters reaching `#private` fields still work.
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }

      bound ??= async (...args: unknown[]): Promise<unknown> => {
        hooks.onToolStart?.({ toolName });
        try {
          const result: unknown = await execute.apply(target, args);
          hooks.onToolFinish?.({ toolName, result });
          return result;
        } catch (error) {
          hooks.onToolError?.({ toolName, error });
          throw error;
        }
      };
      return bound;
    },
  });
}
