# Caplytics

Spend control and cost tracking for AI agents. Attach a budget to a Mastra agent in one line, see
every model and tool call it makes, and stop a runaway run before it stops your invoice.

```ts
import { Agent } from "@mastra/core/agent";
import { caplytics } from "caplytics";

export const supportAgent = caplytics.attach(
  new Agent({ id: "support-agent", model: "anthropic/claude-sonnet-5", tools: { refundTool } }),
  { cap: 5.0, onLimit: "block" },
);
```

`attach()` returns the same agent, with the same type. Nothing downstream changes — `.generate()`,
`.stream()`, workflows and Studio all keep working, and `new Mastra({ agents: { supportAgent } })`
keeps full inference.

## What it does

- **Tracks every call.** One structured event per model call and per tool call, priced from the
  provider's own reported usage — including the cache-read and cache-write split, which is often the
  difference between a call costing cents and costing a fraction of one.
- **Stops runs that exceed their budget**, between calls and mid-stream.
- **Degrades before it blocks.** Drop to a cheaper model or cap output as a run approaches its cap,
  re-evaluated on every call.
- **Answers "what did this customer cost us".** Arbitrary metadata on any call, queryable by
  dimension and time window.
- **Ships a dashboard** as a Docker image.

## Install

```bash
npm install caplytics
```

`@mastra/core` is an optional peer dependency — install it if you use the Mastra adapter.

## Using it

Full documentation, dashboard setup and known limitations:
https://github.com/jaymalave/caplytics
