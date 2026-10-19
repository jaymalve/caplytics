import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const corners = [
  "-top-1.5 -left-1.5",
  "-top-1.5 -right-1.5",
  "-bottom-1.5 -left-1.5",
  "-bottom-1.5 -right-1.5",
];

/** The bracket-corner "viewfinder" button treatment used on usefr.com's primary CTAs. */
export function BracketButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <div className="group relative inline-block">
      {corners.map((position) => (
        <span
          key={position}
          aria-hidden
          className={cn(
            "pointer-events-none absolute size-3 text-border transition-colors group-hover:text-primary",
            position,
          )}
        >
          <PlusMark />
        </span>
      ))}
      <Button
        className={cn(
          "rounded-none bg-primary px-6 text-xs tracking-widest text-primary-foreground uppercase hover:bg-primary/90",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function PlusMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      fill="none"
      className="size-full"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path d="M6 1v10M1 6h10" />
    </svg>
  );
}
