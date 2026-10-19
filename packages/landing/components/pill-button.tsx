import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary text-primary-foreground shadow-(--shadow-primary) hover:bg-primary/90",
  secondary:
    "bg-secondary text-secondary-foreground shadow-(--shadow-secondary) hover:bg-secondary/70",
};

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-5 text-[15px]",
};

/** foglamp.dev's fully rounded button, in a dark-ink primary and a soft secondary. */
export function PillButton({
  tone = "primary",
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "size"> & {
  tone?: keyof typeof tones;
  size?: keyof typeof sizes;
}) {
  return (
    <Button
      className={cn(
        "rounded-full font-medium active:scale-[0.97]",
        tones[tone],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
