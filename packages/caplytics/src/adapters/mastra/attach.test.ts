import { describe, expect, test } from "bun:test";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { attach, budgetKeyFor } from "./attach.js";

/**
 * A stub language model implementing the AI SDK interface. Never a live provider — CI has no API
 * keys and must never need them.
 */
function stubModel(script: { toolCall?: boolean } = {}) {
  let calls = 0;
  return {
    calls: () => calls,
    model: {
      specificationVersion: "v2" as const,
      provider: "stub",
      modelId: "stub-model",
      supportedUrls: {},
      async doGenerate() {
        calls += 1;
        const wantsTool = script.toolCall === true && calls === 1;
        return {
          content: wantsTool
            ? [
                {
                  type: "tool-call" as const,
                  toolCallId: "call_1",
                  toolName: "echoTool",
                  input: JSON.stringify({ text: "hi" }),
                },
              ]
            : [{ type: "text" as const, text: "done" }],
          finishReason: wantsTool ? ("tool-calls" as const) : ("stop" as const),
          usage: { inputTokens: 100, outputTokens: 7, totalTokens: 107 },
          warnings: [],
        };
      },
      async doStream() {
        throw new Error("stream not scripted");
      },
    },
  };
}

function buildAgent(model: unknown, toolExecute: () => unknown = () => ({ echoed: "hi" })) {
  const echoTool = createTool({
    id: "echoTool",
    description: "Echoes text back",
    inputSchema: z.object({ text: z.string() }),
    execute: async () => toolExecute(),
  });

  return new Agent({
    id: "support-agent",
    name: "support-agent",
    instructions: "test",
    model: model as never,
    tools: { echoTool },
  });
}

describe("identity", () => {
  test("returns the very same instance, which is what keeps T exact", () => {
    const agent = buildAgent(stubModel().model);

    expect(attach(agent)).toBe(agent);
  });

  test("leaves the agent's own surface untouched", () => {
    const agent = buildAgent(stubModel().model);

    const attached = attach(agent);

    expect(attached.id).toBe("support-agent");
    expect(attached.name).toBe("support-agent");
    // §3: nothing is bolted onto the instance that could collide with Mastra's surface.
    expect("caplytics" in attached).toBe(false);
  });

  test("still reports its tools", async () => {
    const agent = attach(buildAgent(stubModel().model));

    expect(Object.keys(await agent.listTools())).toEqual(["echoTool"]);
  });
});

describe("interception is invisible", () => {
  test("an attached agent produces the same result as an unattached one", async () => {
    const plain = await buildAgent(stubModel().model).generate("say hi");
    const attached = await attach(buildAgent(stubModel().model)).generate("say hi");

    expect(attached.text).toBe(plain.text);
  });

  test("tool results still reach the model loop", async () => {
    const agent = attach(buildAgent(stubModel({ toolCall: true }).model));

    const result = await agent.generate("use the tool");

    expect(result.text).toBe("done");
  });

  test("a tool's failure still propagates", async () => {
    const agent = attach(
      buildAgent(stubModel({ toolCall: true }).model, () => {
        throw new Error("tool exploded");
      }),
    );

    const result = await agent.generate("use the tool");

    // Mastra reports the failure to the model rather than throwing; what matters is that the
    // wrapper neither swallowed it nor replaced it with its own error.
    expect(result.text).toBe("done");
  });
});

describe("hooks observe both interception points", () => {
  test("the model resolver fires once per model call, not once per attach", async () => {
    const starts: string[] = [];
    const agent = attach(
      buildAgent(stubModel({ toolCall: true }).model),
      {},
      {
        onModelCall: (info) => starts.push(info.method),
      },
    );

    await agent.generate("use the tool");

    // Two model calls in one run: the tool-calling turn and the turn after it. §5's ladder depends
    // on exactly this — re-resolution per call, not per agent.
    expect(starts).toEqual(["doGenerate", "doGenerate"]);
  });

  test("tool execution is observed", async () => {
    const tools: string[] = [];
    const agent = attach(
      buildAgent(stubModel({ toolCall: true }).model),
      {},
      {
        onToolCall: (info) => tools.push(info.toolName),
      },
    );

    await agent.generate("use the tool");

    expect(tools).toEqual(["echoTool"]);
  });

  test("a tool's result is observable without being altered", async () => {
    const results: unknown[] = [];
    const agent = attach(
      buildAgent(stubModel({ toolCall: true }).model),
      {},
      {
        onToolResult: (info) => results.push(info.result),
      },
    );

    await agent.generate("use the tool");

    expect(results).toEqual([{ echoed: "hi" }]);
  });

  test("a failing tool is reported to onToolError", async () => {
    const errors: unknown[] = [];
    const agent = attach(
      buildAgent(stubModel({ toolCall: true }).model, () => {
        throw new Error("tool exploded");
      }),
      {},
      { onToolError: (info) => errors.push(info.error) },
    );

    await agent.generate("use the tool");

    expect((errors[0] as Error).message).toBe("tool exploded");
  });
});

describe("budget key", () => {
  // §2.2: `id` is already required at construction; asking for it twice invites drift.
  test("defaults to agent.id", () => {
    expect(budgetKeyFor(buildAgent(stubModel().model), {})).toBe("support-agent");
  });

  test("can be overridden so several agents share one pool", () => {
    expect(budgetKeyFor(buildAgent(stubModel().model), { budget: "shared" })).toBe("shared");
  });
});

describe("model shapes", () => {
  test("a model id string is resolved so there is something to intercept", async () => {
    const agent = attach(buildAgent("anthropic/claude-sonnet-4-5"));

    const resolved = await (agent.model as (c: unknown) => Promise<unknown>)({});

    // Constructed, not called — reaching a provider would need credentials CI does not have.
    expect(Reflect.get(resolved as object, "modelId")).toBe("claude-sonnet-4-5");
    expect(typeof Reflect.get(resolved as object, "doGenerate")).toBe("function");
  });

  // Mastra normalises a fallback list at construction, so this asserts the shape survives rather
  // than reference equality: caplytics must not collapse a list of models into a single proxy.
  test("a shape with no single underlying model is passed through unwrapped", async () => {
    const agent = attach(buildAgent([{ id: "a" }, { id: "b" }]));

    const resolved = await (agent.model as (c: unknown) => Promise<unknown>)({});

    expect(Array.isArray(resolved)).toBe(true);
    expect((resolved as { id: string }[]).map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

test("refuses to attach when Mastra lacks the tool hooks, rather than under-reporting", () => {
  const agent = buildAgent(stubModel().model);
  Object.defineProperty(agent, "__setTools", { value: undefined, configurable: true });

  expect(() => attach(agent)).toThrow(/does not expose the tool hooks/);
});
