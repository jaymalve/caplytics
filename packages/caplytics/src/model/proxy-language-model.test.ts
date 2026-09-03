import { describe, expect, test } from "bun:test";
import { proxyLanguageModel } from "./proxy-language-model.js";

function stubModel() {
  return {
    specificationVersion: "v2" as const,
    provider: "stub",
    modelId: "stub-model",
    supportedUrls: {},
    extraFieldFromANewerSpec: "kept",
    async doGenerate(options: { prompt: string }) {
      return { echoedPrompt: options.prompt, usage: { inputTokens: 10, outputTokens: 2 } };
    },
    async doStream() {
      return { stream: "streaming" };
    },
  };
}

/** A class with a private field, which is what makes the receiver choice in the proxy matter. */
class PrivateFieldModel {
  #secret = "hidden";
  readonly specificationVersion = "v2" as const;
  readonly modelId = "private-model";

  get exposed(): string {
    return this.#secret;
  }

  reveal(): string {
    return this.#secret;
  }

  async doGenerate(): Promise<{ ok: true }> {
    return { ok: true };
  }
}

describe("transparency", () => {
  test("passes through plain properties", () => {
    const proxied = proxyLanguageModel(stubModel());

    expect(proxied.modelId).toBe("stub-model");
    expect(proxied.provider).toBe("stub");
    expect(proxied.specificationVersion).toBe("v2");
  });

  // Mastra accepts four spec versions; a hand-written wrapper would drop whatever it did not know.
  test("passes through fields it has never heard of", () => {
    expect(proxyLanguageModel(stubModel()).extraFieldFromANewerSpec).toBe("kept");
  });

  test("reports the same keys as the model it wraps", () => {
    const model = stubModel();

    expect(Object.keys(proxyLanguageModel(model))).toEqual(Object.keys(model));
  });

  test("answers `in` like the underlying model", () => {
    const proxied = proxyLanguageModel(stubModel());

    expect("doStream" in proxied).toBe(true);
    expect("nonexistent" in proxied).toBe(false);
  });

  test("keeps instanceof answering about the real model", () => {
    expect(proxyLanguageModel(new PrivateFieldModel())).toBeInstanceOf(PrivateFieldModel);
  });

  test("returns the underlying result unchanged", async () => {
    const proxied = proxyLanguageModel(stubModel());

    expect(await proxied.doGenerate({ prompt: "hello" })).toEqual({
      echoedPrompt: "hello",
      usage: { inputTokens: 10, outputTokens: 2 },
    });
  });

  test("method identity is stable across reads", () => {
    const proxied = proxyLanguageModel(stubModel());

    expect(proxied.doGenerate).toBe(proxied.doGenerate);
  });
});

/**
 * Real model implementations are classes with `#private` fields. Reading through the proxy with the
 * proxy as receiver would make every such access throw, which is why the trap uses the target.
 */
describe("class instances with private fields", () => {
  test("a getter reaching a private field still works", () => {
    expect(proxyLanguageModel(new PrivateFieldModel()).exposed).toBe("hidden");
  });

  test("a method reaching a private field still works", () => {
    expect(proxyLanguageModel(new PrivateFieldModel()).reveal()).toBe("hidden");
  });

  test("the intercepted method also reaches private state", async () => {
    expect(await proxyLanguageModel(new PrivateFieldModel()).doGenerate()).toEqual({ ok: true });
  });
});

describe("hooks", () => {
  test("observe a generate call without altering it", async () => {
    const seen: string[] = [];
    const proxied = proxyLanguageModel(stubModel(), {
      onCallStart: (info) => seen.push(`start:${info.method}:${info.modelId}`),
      onCallFinish: (info) => seen.push(`finish:${info.method}`),
    });

    await proxied.doGenerate({ prompt: "hi" });

    expect(seen).toEqual(["start:doGenerate:stub-model", "finish:doGenerate"]);
  });

  test("observe a stream call", async () => {
    const methods: string[] = [];
    const proxied = proxyLanguageModel(stubModel(), {
      onCallStart: (info) => methods.push(info.method),
    });

    await proxied.doStream();

    expect(methods).toEqual(["doStream"]);
  });

  test("expose the result, which is where usage is reported", async () => {
    let captured: unknown;
    const proxied = proxyLanguageModel(stubModel(), {
      onCallFinish: (info) => {
        captured = info.result;
      },
    });

    await proxied.doGenerate({ prompt: "hi" });

    expect((captured as { usage: unknown }).usage).toEqual({ inputTokens: 10, outputTokens: 2 });
  });

  test("a failing call is reported and still throws", async () => {
    const model = stubModel();
    model.doGenerate = () => Promise.reject(new Error("provider down"));
    const errors: unknown[] = [];
    const proxied = proxyLanguageModel(model, { onCallError: (info) => errors.push(info.error) });

    await expect(proxied.doGenerate({ prompt: "hi" })).rejects.toThrow("provider down");
    expect((errors[0] as Error).message).toBe("provider down");
  });

  test("no hooks means pure pass-through", async () => {
    const proxied = proxyLanguageModel(stubModel());

    expect(await proxied.doStream()).toEqual({ stream: "streaming" });
  });
});

/**
 * §5's ladder lives here rather than in the model resolver: Mastra resolves a model twice per run
 * and reuses the instance, so this wrapper is the only seam entered on every call.
 */
describe("per-call selection", () => {
  function labelled(modelId: string, seen: string[]) {
    return {
      specificationVersion: "v2" as const,
      provider: "stub",
      modelId,
      supportedUrls: {},
      async doGenerate(options: { maxOutputTokens?: number }) {
        seen.push(`${modelId}:${String(options?.maxOutputTokens)}`);
        return { ok: modelId };
      },
      async doStream() {
        return { streamed: modelId };
      },
    };
  }

  test("delegates to the wrapped model when nothing is selected", async () => {
    const seen: string[] = [];
    const proxied = proxyLanguageModel(labelled("base", seen), { selectForCall: () => undefined });

    await proxied.doGenerate({});

    expect(seen).toEqual(["base:undefined"]);
  });

  test("delegates to a substituted model for that call only", async () => {
    const seen: string[] = [];
    const cheap = labelled("cheap", seen);
    let degraded = false;
    const proxied = proxyLanguageModel(labelled("base", seen), {
      selectForCall: () => (degraded ? { model: cheap } : undefined),
    });

    await proxied.doGenerate({});
    degraded = true;
    await proxied.doGenerate({});
    degraded = false;
    await proxied.doGenerate({});

    // Down a rung and back up again, which §5 requires to work in both directions.
    expect(seen).toEqual(["base:undefined", "cheap:undefined", "base:undefined"]);
  });

  test("reports the substituted model's id, so events name what actually ran", async () => {
    const seen: string[] = [];
    const ids: string[] = [];
    const proxied = proxyLanguageModel(labelled("base", seen), {
      selectForCall: () => ({ model: labelled("cheap", seen) }),
      onCallFinish: (info) => ids.push(info.modelId),
    });

    await proxied.doGenerate({});

    expect(ids).toEqual(["cheap"]);
  });

  test("clamps output tokens", async () => {
    const seen: string[] = [];
    const proxied = proxyLanguageModel(labelled("base", seen), {
      selectForCall: () => ({ maxOutputTokens: 500 }),
    });

    await proxied.doGenerate({});

    expect(seen).toEqual(["base:500"]);
  });

  // Raising a caller's own limit to spend more budget would invert what they asked for.
  test("lowers a caller's limit but never raises it", async () => {
    const seen: string[] = [];
    const proxied = proxyLanguageModel(labelled("base", seen), {
      selectForCall: () => ({ maxOutputTokens: 500 }),
    });

    await proxied.doGenerate({ maxOutputTokens: 100 });

    expect(seen).toEqual(["base:100"]);
  });
});
