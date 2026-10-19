import { Badge } from "@/components/ui/badge";
import { CAP_END, Wordmark } from "@/components/wordmark";

// usefr.com's composition: the tagline sits in the gap to the right of the first
// word, and the description hangs below the second word's right half.
const besideCap = { left: `calc(${CAP_END * 100}% + 1.5rem)` };

export function Hero() {
  return (
    <section className="px-6 pt-10 pb-24 md:px-10 md:pt-14">
      <div className="flex justify-center">
        <Badge
          variant="outline"
          className="h-auto gap-2 rounded-none border-border bg-card px-2.5 py-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
        >
          <span className="flex size-3.5 items-center justify-center bg-primary text-[9px] font-bold text-primary-foreground">
            $
          </span>
          Open source · self-hosted
        </Badge>
      </div>

      <h1 className="relative mt-12 text-primary md:mt-16">
        <Wordmark />
        <span
          className="absolute top-0 hidden text-xs font-medium tracking-wider text-foreground uppercase md:block"
          style={besideCap}
        >
          Spend control for AI agents
        </span>
      </h1>

      <p className="mt-8 max-w-sm text-xs leading-relaxed font-medium tracking-wide text-foreground uppercase md:mt-6 md:ml-[56%]">
        <span className="mb-3 block text-muted-foreground md:hidden">
          Spend control for AI agents
        </span>
        Attaches a budget to any agent in one line, stops the overspend before it happens, and tags
        every call so you can see where it went
      </p>
    </section>
  );
}
