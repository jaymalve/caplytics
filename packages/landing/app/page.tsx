import { FeatureSection } from "@/components/feature-section";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { BudgetMockup } from "@/components/mockups/budget-mockup";
import { EventTableMockup } from "@/components/mockups/event-table-mockup";
import { Nav } from "@/components/nav";

export default function Home() {
  return (
    <main>
      {/* The wordmark runs near edge to edge, as on usefr.com; the content below keeps a reading width. */}
      <div className="mx-auto max-w-[1680px]">
        <Nav />
        <Hero />
      </div>
      <div className="mx-auto max-w-6xl">
        <FeatureSection
          headline={
            <>
              Stop the overspend
              <br />
              before it happens.
            </>
          }
          description="Every model and tool call is checked against the budget before it fires. Hard caps block outright; degradation ladders downgrade the model or trim output as spend climbs — no silent runaway bill at the end of a run."
        >
          <BudgetMockup />
        </FeatureSection>
        <FeatureSection
          headline={
            <>
              Know exactly what
              <br />
              you&apos;re spending, and on what.
            </>
          }
          description="Every call emits a structured event — tokens, cost, budget remaining. Filter by agent, date range, or any metadata key you've tagged: customer, channel, task."
        >
          <EventTableMockup />
        </FeatureSection>
        <Footer />
      </div>
    </main>
  );
}
