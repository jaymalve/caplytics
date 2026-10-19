import { ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { links } from "@/lib/links";

// Every answer restates the SDK README. If one of these changes, the README changed first.
const questions = [
  {
    q: "What is Caplytics?",
    a: "Spend control and cost tracking for AI agents. Attach a budget to an agent in one line and every model and tool call it makes becomes a priced event. A run that crosses its cap is degraded or stopped before the next call fires.",
  },
  {
    q: "Which frameworks does it support?",
    a: "Mastra, through caplytics.attach(). It returns the same agent with the same type, so .generate(), .stream(), workflows and Studio keep working. The cost model and budget ledger in @caplytics/core don't depend on Mastra.",
  },
  {
    q: "How is each call priced?",
    a: "From the provider's own reported usage, including the cache-read and cache-write split, at rates from LiteLLM's published pricing feed. A model with no known price is recorded as unpriced and consumes no budget. It is never priced at zero.",
  },
  {
    q: "Can I self-host it?",
    a: "Yes, and that's the only way it runs. The dashboard ships as a Docker image, and one docker compose command brings up TimescaleDB and the dashboard together. The schema is applied on boot, so there is no migration step.",
  },
  {
    q: "Does a cap guarantee zero overspend?",
    a: "No. Caps are checked between calls and mid-stream, but tokens already streamed are billed, so a mid-stream stop is as fast as possible rather than exact. Caps are also per process: N replicas means N independent caps.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto mt-32 w-full max-w-7xl scroll-mt-20 px-5 sm:mt-40 sm:px-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-20">
        <header>
          <h2 className="text-3xl font-[450] tracking-tight text-balance sm:text-4xl">Questions</h2>
          <p className="mt-3 max-w-xs text-pretty text-muted-foreground">
            The short ones are here. For anything else, the README has the details.
          </p>
        </header>
        <div className="-mt-4">
          <Accordion type="single" collapsible>
            {questions.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="border-b border-border/70">
                <AccordionTrigger className="py-4 text-base font-normal hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed text-pretty text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <a
            href={links.docs}
            className="flex items-center justify-between border-b border-border/70 py-4 text-base text-muted-foreground transition-colors hover:text-foreground"
          >
            Read the full docs
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
