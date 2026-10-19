import { CopyCommand } from "@/components/copy-command";
import { PillButton } from "@/components/pill-button";
import { links } from "@/lib/links";

export function ClosingCta() {
  return (
    <section className="mx-auto mt-16 mb-24 w-full max-w-7xl px-5 sm:mt-24 sm:mb-52 sm:px-8">
      <div className="flex flex-col items-center gap-12 py-14 text-center sm:py-20">
        <h2 className="text-5xl font-[450] tracking-tight text-balance sm:text-6xl">
          Your first budget <br />
          is one line away.
        </h2>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <CopyCommand command="npm install caplytics" />
          <PillButton asChild>
            <a href={links.sdk}>Get started</a>
          </PillButton>
        </div>
      </div>
    </section>
  );
}
