# caplytics

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

```ts
// Once at startup: load pricing before the first call, so nothing is recorded as unpriced.
await caplytics.warmPricing();

// Subscribe by budget key. Nothing is attached to the agent instance.
caplytics.on("support-agent", (event) => {
  console.log(event.type, event.name, event.costActual, event.budgetRemaining);
});

// `run()` groups the calls inside it into one run, which is what a per-run cap bounds.
await caplytics.run(() => supportAgent.generate(messages));
```

**A cap needs a run boundary.** Mastra offers no interception point that can bracket `.generate()`,
so caplytics cannot infer one — wrap calls in `caplytics.run()`, or pass
`requestContext: caplytics.context({ customerId: "cus_1" })`. Without either, spend is still tracked
and events are still emitted, but caplytics warns that per-run caps are not being enforced rather
than pretending to hold a limit it cannot.

### Configuration

```ts
caplytics.attach(agent, {
  cap: 5.0,                        // dollars per run; "unlimited" opts out explicitly
  onLimit: "warn",                 // "warn" (default) | "block" | "degrade"
  degrade: [                       // consulted before every call
    { at: 0.7, model: "anthropic/claude-haiku-4-5" },
    { at: 0.85, maxTokens: 500 },
  ],
  metadata: { category: "customer-support" },
  tools: { refundTool: { cap: 1.0, cost: 0.005 } },
});
```

Tool names are constrained to the agent's own tool map — a typo is a compile error, not a filter
that silently never matches.

The default when you configure nothing is **$1.00 per run with `onLimit: "warn"`**: something is
always enforced, and a new agent never dies silently on its first run.

## Pricing

Rates come from [LiteLLM's published pricing feed][litellm] at runtime, cached in memory — not
compiled into the package. Prices change and models ship continuously, so a table baked into a
release is wrong from the day it is cut.

A model with no known price is recorded with `priceUnknown: true` and consumes no budget. It is
never priced at zero, because "free" and "unmeasured" must not look alike.

[litellm]: https://github.com/BerriAI/litellm

## Dashboard

From a clone of the repository, one command brings up TimescaleDB and the dashboard together:

```bash
cp .env.example .env   # fill in AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
docker compose --profile dashboard up --build
```

Or run the image against a TimescaleDB you manage yourself:

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e GOOGLE_CLIENT_ID=... \
  -e GOOGLE_CLIENT_SECRET=... \
  -e ALLOWED_EMAIL_DOMAINS=yourcompany.com \
  caplytics/dashboard
```

`ALLOWED_EMAIL_DOMAINS` is optional, and leaving it unset means **any Google account can sign in**.
Set it unless you mean that.

The image applies the schema on boot, so there is no separate migration step.

## Known limitations

- **Caps are per-process.** N replicas means N independent caps.
- **Mid-stream abort is best effort.** Tokens already streamed are billed and unrecoverable; this
  stops as fast as possible, it does not guarantee zero overage.
- **Per-tool caps are declared but not enforced** — see
  [architecture/per-tool-caps-deferred.md][per-tool-caps].
- **The event table is not sortable.** A keyset cursor is a position in one ordering; see
  [architecture/table-sorting-and-cursors.md][table-sorting].

[per-tool-caps]: https://github.com/jaymalave/caplytics/blob/main/architecture/per-tool-caps-deferred.md
[table-sorting]: https://github.com/jaymalave/caplytics/blob/main/architecture/table-sorting-and-cursors.md

## Full documentation

Dashboard setup, the example agent, and development instructions:
https://github.com/jaymalave/caplytics

## License

MIT
