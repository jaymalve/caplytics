import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Spelled out in full so Tailwind's scanner sees every class; it can't see interpolated names.
const hues = {
  green:
    "bg-emerald-100 text-emerald-600 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.14),0_2px_6px_-2px_rgba(16,185,129,0.25)]",
  orange:
    "bg-orange-100 text-orange-500 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.14),0_2px_6px_-2px_rgba(249,115,22,0.25)]",
  red: "bg-red-100 text-red-500 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.14),0_2px_6px_-2px_rgba(239,68,68,0.25)]",
  violet:
    "bg-violet-100 text-violet-500 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.14),0_2px_6px_-2px_rgba(139,92,246,0.25)]",
  sky: "bg-sky-100 text-sky-500 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.14),0_2px_6px_-2px_rgba(14,165,233,0.25)]",
  yellow:
    "bg-yellow-100 text-yellow-600 shadow-[inset_0_0_0_1px_rgba(234,179,8,0.14),0_2px_6px_-2px_rgba(234,179,8,0.25)]",
};

export type Hue = keyof typeof hues;

/** A small tinted icon tile, as foglamp.dev uses to label each feature row. */
export function IconTile({
  icon: Icon,
  hue,
  className,
}: {
  icon: LucideIcon;
  hue: Hue;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[5px] p-0.5",
        hues[hue],
        className,
      )}
    >
      <Icon className="size-full" strokeWidth={2.25} />
    </span>
  );
}

export function IconChip({ icon, hue, label }: { icon: LucideIcon; hue: Hue; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <IconTile icon={icon} hue={hue} />
      {label}
    </span>
  );
}
