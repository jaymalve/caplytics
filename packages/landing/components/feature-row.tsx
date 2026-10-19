import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type Hue, IconChip } from "@/components/icon-chip";
import { PillButton } from "@/components/pill-button";

export type Chip = { icon: LucideIcon; hue: Hue; label: string };

/**
 * foglamp.dev's feature row: a narrow copy column (chips, heading, one line, a pill CTA)
 * beside a visual twice its width, vertically centred.
 */
export function FeatureRow({
  id,
  chips,
  title,
  description,
  cta,
  children,
}: {
  id: string;
  chips: Chip[];
  title: string;
  description: string;
  cta: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      id={id}
      className="grid scroll-mt-20 items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_2fr] lg:gap-16"
    >
      <div className="max-w-sm">
        <ul className="mb-5 flex flex-wrap gap-x-4 gap-y-2">
          {chips.map((chip) => (
            <li key={chip.label}>
              <IconChip {...chip} />
            </li>
          ))}
        </ul>
        <h2
          id={`${id}-heading`}
          className="text-3xl leading-[1.12] font-[450] tracking-tight text-balance sm:text-4xl"
        >
          {title}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
        <PillButton asChild className="mt-6">
          <a href={cta.href}>{cta.label}</a>
        </PillButton>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
