import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { caplytics, formatUsd, usdToMicroDollars } from "caplytics";
import { z } from "zod";

/**
 * The whole integration, in the shape §1 promises: construct the agent as you already would, wrap
 * it once, and change nothing downstream.
 */
const searchDocsTool = createTool({
  id: "searchDocsTool",
  description: "Searches the product documentation.",
  inputSchema: z.object({ query: z.string() }),
  execute: async (input) => {
    const { query } = input as unknown as { query: string };
    return { results: [`Refunds are issued within 5 business days. (matched "${query}")`] };
  },
});

const cap = Number(process.env.CAP ?? 0.5);

const supportAgent = caplytics.attach(
  new Agent({
    id: "support-agent",
    name: "support-agent",
    instructions: "You are a concise customer support agent. Use the docs tool before answering.",
    model: "anthropic/claude-sonnet-4-5",
    tools: { searchDocsTool },
  }),
  {
    cap,
    // "warn" is the default and never kills a run; "block" is what actually stops one.
    onLimit: "block",
    // §5's ladder: drop to a cheaper model before the cap rather than at it.
    degrade: [{ at: 0.7, model: "anthropic/claude-haiku-4-5" }],
    metadata: { category: "customer-support" },
  },
);

// §3: subscription is by budget key, and never touches the agent instance.
caplytics.on("support-agent", (event) => {
  const cost = event.priceUnknown ? "price unknown" : formatUsd(event.costActual);
  const remaining =
    event.budgetRemaining === null ? "uncapped" : `${formatUsd(event.budgetRemaining)} left`;

  console.log(
    `  ${event.type.padEnd(10)} ${event.name.padEnd(34)} ${cost.padStart(10)}  ${remaining}`,
  );
});

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY === undefined) {
    console.error("Set ANTHROPIC_API_KEY to run this example.");
    process.exit(1);
  }

  // Prices are fetched once, before the first call, so no call is recorded as unpriced.
  await caplytics.warmPricing();

  console.log(`\ncap: ${formatUsd(usdToMicroDollars(cap))}\n`);

  try {
    // `run()` is what groups the calls below into one run, which is what a per-run cap bounds.
    const result = await caplytics.run(() =>
      supportAgent.generate("How long do refunds take? Check the docs."),
    );
    console.log(`\n${result.text}\n`);
  } catch (error) {
    console.error(`\n${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}

await main();
