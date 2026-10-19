import type { ReactNode } from "react";

export function FeatureSection({
  headline,
  description,
  children,
}: {
  headline: ReactNode;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border px-6 py-16 md:px-10 md:py-20">
      <h2 className="max-w-xl text-3xl leading-tight font-bold text-primary md:text-5xl">
        {headline}
      </h2>
      <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
        {description}
      </p>
      <div className="mt-10">{children}</div>
    </section>
  );
}
