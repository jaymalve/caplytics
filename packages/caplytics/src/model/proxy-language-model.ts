export type ModelCallHooks = {
  onCallStart?: (info: {
    readonly modelId: string;
    readonly method: "doGenerate" | "doStream";
  }) => void;
  onCallFinish?: (info: {
    readonly modelId: string;
    readonly method: "doGenerate" | "doStream";
    readonly result: unknown;
  }) => void;
  onCallError?: (info: { readonly modelId: string; readonly error: unknown }) => void;
};

const INTERCEPTED = new Set(["doGenerate", "doStream"]);

/**
 * Wraps a language model, returning something indistinguishable from it.
 *
 * This is the mechanism the whole design rests on (architecture/model-proxy-over-string-swap.md):
 * because the per-call resolver may return a model *object*, one wrapper covers usage capture (§3),
 * mid-stream abort (§4.2) and model swapping (§5) without a third interception point.
 *
 * A `Proxy` rather than a hand-written implementation because Mastra accepts four language-model
 * spec versions. Forwarding everything and intercepting two methods is version-agnostic; an
 * explicit wrapper would need a branch per version and would silently drop anything a newer spec
 * adds.
 */
export function proxyLanguageModel<T extends object>(model: T, hooks: ModelCallHooks = {}): T {
  const bound = new Map<string | symbol, unknown>();

  return new Proxy(model, {
    get(target, property) {
      if (typeof property === "string" && INTERCEPTED.has(property)) {
        return intercepted(target, property as "doGenerate" | "doStream", hooks, bound);
      }

      // Read with the *target* as receiver, not the proxy. Model implementations are classes with
      // `#private` fields, and a getter invoked with the proxy as `this` cannot reach them.
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;

      return memoise(bound, property, () => value.bind(target));
    },

    // Keep `instanceof` and prototype checks answering about the real model.
    getPrototypeOf(target) {
      return Reflect.getPrototypeOf(target);
    },

    has(target, property) {
      return Reflect.has(target, property);
    },
  }) as T;
}

function intercepted(
  target: object,
  method: "doGenerate" | "doStream",
  hooks: ModelCallHooks,
  bound: Map<string | symbol, unknown>,
): unknown {
  const original = Reflect.get(target, method, target);
  if (typeof original !== "function") return original;

  return memoise(bound, `caplytics:${method}`, () => {
    return async (...args: unknown[]): Promise<unknown> => {
      const modelId = readModelId(target);
      hooks.onCallStart?.({ modelId, method });

      try {
        const result: unknown = await original.apply(target, args);
        hooks.onCallFinish?.({ modelId, method, result });
        return result;
      } catch (error) {
        hooks.onCallError?.({ modelId, error });
        throw error;
      }
    };
  });
}

// Stable identity per property: a caller comparing `model.doStream === model.doStream` should not
// see two different functions, and re-binding on every access would allocate per property read.
function memoise<T>(
  cache: Map<string | symbol, unknown>,
  key: string | symbol,
  create: () => T,
): T {
  if (!cache.has(key)) cache.set(key, create());
  return cache.get(key) as T;
}

function readModelId(target: object): string {
  const value = Reflect.get(target, "modelId", target);
  return typeof value === "string" ? value : "unknown";
}
