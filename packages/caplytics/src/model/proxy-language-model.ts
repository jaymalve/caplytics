import { estimateTokenCount } from "@caplytics/core";

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

  /**
   * Chooses what this individual call should run against, consulted immediately before delegating.
   *
   * This is where §5's ladder lives. Mastra resolves a model twice per run and reuses the instance,
   * so the resolver cannot re-evaluate per call — but this wrapper is entered on every one. See
   * architecture/mastra-interception-points.md.
   */
  selectForCall?: () => CallSelection | undefined;

  /**
   * Consulted as a stream produces output, with tokens estimated from the text seen so far.
   *
   * Returning "abort" cancels the provider call (§4.2). Best effort by construction: tokens already
   * streamed are billed and unrecoverable, so this stops as fast as possible rather than
   * guaranteeing zero overage.
   */
  onStreamProgress?: (info: {
    readonly modelId: string;
    readonly estimatedOutputTokens: number;
  }) => "continue" | "abort";
};

export type CallSelection = {
  /** Delegate to this model instead of the wrapped one, for this call only. */
  readonly model?: object;
  /** Upper bound on this call's output tokens. */
  readonly maxOutputTokens?: number;
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
      // Evaluated per call, not per resolution — the whole reason the ladder lives here.
      const selection = hooks.selectForCall?.();
      const delegate = selection?.model ?? target;
      const modelId = readModelId(delegate);

      hooks.onCallStart?.({ modelId, method });

      try {
        // Re-read from the delegate: a substituted model has its own implementation.
        const call = Reflect.get(delegate, method, delegate);
        if (typeof call !== "function") {
          throw new TypeError(`caplytics: substituted model has no ${method}`);
        }

        // The proxy owns the controller because `abortSignal` on Mastra's execution options is
        // supplied by the caller, and attach() does not control call sites. Injecting it here keeps
        // §1's two interception points intact.
        const aborter = new AbortController();
        const withSignal = withAbortSignal(
          clampOutput(args, selection?.maxOutputTokens),
          aborter.signal,
        );

        const result: unknown = await call.apply(delegate, withSignal);
        const guarded =
          method === "doStream" && hooks.onStreamProgress !== undefined
            ? guardStream(result, aborter, modelId, hooks.onStreamProgress)
            : result;

        hooks.onCallFinish?.({ modelId, method, result: guarded });
        return guarded;
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

/**
 * Lowers the ceiling, never raises it: a caller who asked for fewer tokens than the rung allows
 * meant it, and lifting their limit to spend more budget would invert the intent.
 */
function clampOutput(args: unknown[], limit: number | undefined): unknown[] {
  const [options, ...rest] = args;
  if (limit === undefined || typeof options !== "object" || options === null) return args;

  const requested = Reflect.get(options, "maxOutputTokens");
  const effective = typeof requested === "number" ? Math.min(requested, limit) : limit;

  return [{ ...options, maxOutputTokens: effective }, ...rest];
}

/** Combines with any signal the caller already passed, rather than replacing it. */
function withAbortSignal(args: unknown[], signal: AbortSignal): unknown[] {
  const [options, ...rest] = args;
  if (typeof options !== "object" || options === null) return args;

  const existing = Reflect.get(options, "abortSignal");
  const combined = existing instanceof AbortSignal ? AbortSignal.any([existing, signal]) : signal;

  return [{ ...options, abortSignal: combined }, ...rest];
}

/**
 * Counts output as it streams and cancels the provider call once the guard says to.
 *
 * Tokens are estimated from accumulated text: providers report usage only in the terminating chunk,
 * which arrives far too late to act on.
 */
function guardStream(
  result: unknown,
  aborter: AbortController,
  modelId: string,
  onStreamProgress: NonNullable<ModelCallHooks["onStreamProgress"]>,
): unknown {
  if (typeof result !== "object" || result === null) return result;

  const stream = Reflect.get(result, "stream");
  if (!(stream instanceof ReadableStream)) return result;

  let text = "";
  let aborted = false;

  const guarded = stream.pipeThrough(
    new TransformStream({
      transform(part: unknown, controller) {
        controller.enqueue(part);
        if (aborted) return;

        const delta = textDeltaOf(part);
        if (delta === undefined) return;

        text += delta;
        if (
          onStreamProgress({ modelId, estimatedOutputTokens: estimateTokenCount(text) }) !== "abort"
        ) {
          return;
        }

        aborted = true;
        aborter.abort();
        controller.terminate();
      },
    }),
  );

  return { ...result, stream: guarded };
}

/** `delta` in the current spec, `textDelta` in older ones; both appear across Mastra's four. */
function textDeltaOf(part: unknown): string | undefined {
  if (typeof part !== "object" || part === null) return undefined;
  if (Reflect.get(part, "type") !== "text-delta") return undefined;

  for (const key of ["delta", "textDelta", "text"]) {
    const value = Reflect.get(part, key);
    if (typeof value === "string") return value;
  }
  return undefined;
}

function readModelId(target: object): string {
  const value = Reflect.get(target, "modelId", target);
  return typeof value === "string" ? value : "unknown";
}
