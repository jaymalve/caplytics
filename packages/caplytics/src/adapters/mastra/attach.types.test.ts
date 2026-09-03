import { expect, test } from "bun:test";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CaplyticsConfig, ToolNames } from "./agent-types.js";
import { attach } from "./attach.js";

/**
 * Type-level guarantees, asserted with `@ts-expect-error` inside the normal typecheck.
 *
 * An unused `@ts-expect-error` is itself an error, so these cannot rot into assertions that quietly
 * stopped testing anything.
 */

const searchDocsTool = createTool({
  id: "searchDocsTool",
  description: "Searches the docs",
  inputSchema: z.object({ query: z.string() }),
  execute: async () => ({ hits: [] }),
});

const refundTool = createTool({
  id: "refundTool",
  description: "Issues a refund",
  inputSchema: z.object({ amount: z.number() }),
  execute: async () => ({ ok: true }),
});

const supportAgent = new Agent({
  id: "support-agent",
  name: "support-agent",
  instructions: "test",
  model: "anthropic/claude-sonnet-4-5",
  tools: { searchDocsTool, refundTool },
});

// --- §2.1: tool names are constrained to the agent's own tool map ---

type Names = ToolNames<typeof supportAgent>;

const knownTool: Names = "refundTool";
// @ts-expect-error a misspelled tool name must not compile
const typoTool: Names = "refndTool";
// @ts-expect-error a tool belonging to some other agent must not compile
const foreignTool: Names = "sendEmailTool";

// --- §2.1: the same constraint applies through the config object ---

const validConfig: CaplyticsConfig<typeof supportAgent> = {
  cap: 5.0,
  tools: { refundTool: { cap: 1.0 } },
};

const typoConfig: CaplyticsConfig<typeof supportAgent> = {
  // @ts-expect-error `refndTool` is not a tool on this agent
  tools: { refndTool: { cap: 1.0 } },
};

// --- §1: attach returns the same T, so inference survives ---

const attached = attach(supportAgent);

// Still the concrete agent type, not a widened Agent<any>: tool names still narrow.
const stillNarrow: ToolNames<typeof attached> = "searchDocsTool";
// @ts-expect-error narrowing would be lost if attach returned Agent<any>
const stillRejectsTypos: ToolNames<typeof attached> = "searchDcsTool";

// §2.2: `agent.id` keeps its literal type, so the budget key is narrowly typed for free.
const literalId: "support-agent" = attached.id;

// The instance is assignable back to its own declared type — what `new Mastra({ agents })` needs.
const roundTrip: typeof supportAgent = attached;

test("type-level assertions compile", () => {
  // The assertions above are checked by `tsc`; this keeps the values used so `noUnusedLocals`
  // cannot quietly delete the thing being tested.
  expect([
    knownTool,
    typoTool,
    foreignTool,
    stillNarrow,
    stillRejectsTypos,
    literalId,
  ]).toHaveLength(6);
  expect(validConfig.tools).toBeDefined();
  expect(typoConfig).toBeDefined();
  expect(roundTrip).toBe(supportAgent);
});
