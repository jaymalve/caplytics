import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The white, 22px-radius card every product visual sits on. `float` is for the card that overlaps another. */
export function Surface({
  float = false,
  className,
  ...props
}: ComponentProps<"div"> & { float?: boolean }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[22px] bg-card text-sm text-card-foreground",
        float ? "shadow-(--shadow-float)" : "shadow-(--shadow-card)",
        className,
      )}
      {...props}
    />
  );
}

export function SurfaceHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pt-5 pb-3", className)}
      {...props}
    />
  );
}

export function SurfaceTitle({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-base font-medium", className)} {...props} />;
}
