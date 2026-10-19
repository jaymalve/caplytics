import {
  Coins,
  Gauge,
  Layers,
  ListChecks,
  Scale,
  ShieldX,
  Tags,
  TrendingDown,
  Users,
} from "lucide-react";
import { ClosingCta } from "@/components/closing-cta";
import { Faq } from "@/components/faq";
import { FeatureRow } from "@/components/feature-row";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Nav } from "@/components/nav";
import { ProductShot } from "@/components/product-shot";
import { BudgetVisual } from "@/components/visuals/budget-visual";
import { CostVisual } from "@/components/visuals/cost-visual";
import { EventsVisual } from "@/components/visuals/events-visual";
import { WorksWith } from "@/components/works-with";
import { links } from "@/lib/links";

// The hero follows usefr.com; everything after it follows foglamp.dev.
export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <div className="mx-auto max-w-[1680px]">
          <Hero />
        </div>
        <ProductShot />
        <WorksWith />
        <div className="mx-auto mt-12 w-full max-w-7xl px-5 sm:mt-20 sm:px-8">
          <FeatureRow
            id="budgets"
            chips={[
              { icon: ShieldX, hue: "red", label: "Hard caps" },
              { icon: TrendingDown, hue: "orange", label: "Degradation" },
              { icon: Gauge, hue: "violet", label: "Mid-stream" },
            ]}
            title="Stop runaway runs"
            description="Every call is checked against the run's budget before it fires. Drop to a cheaper model as spend climbs, then block before the cap."
            cta={{ label: "Set a budget", href: links.sdk }}
          >
            <BudgetVisual />
          </FeatureRow>
          <FeatureRow
            id="costs"
            chips={[
              { icon: Users, hue: "green", label: "Agents" },
              { icon: Tags, hue: "sky", label: "Customers" },
              { icon: Coins, hue: "yellow", label: "Models" },
            ]}
            title="Know what every customer costs"
            description="Tag any call with metadata, then total spend by agent, customer, or anything else you tagged, over any time window."
            cta={{ label: "See attribution", href: links.sdk }}
          >
            <CostVisual />
          </FeatureRow>
          <FeatureRow
            id="events"
            chips={[
              { icon: ListChecks, hue: "sky", label: "Events" },
              { icon: Scale, hue: "orange", label: "Estimate vs actual" },
              { icon: Layers, hue: "violet", label: "Cache tokens" },
            ]}
            title="See every call"
            description="One structured event per model and tool call, priced from the provider's own usage report, in a dashboard you host."
            cta={{ label: "Self-host the dashboard", href: links.selfHost }}
          >
            <EventsVisual />
          </FeatureRow>
        </div>
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
