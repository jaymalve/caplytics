import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The hero wordmark: two words built from vertical bars, staggered so LYTICS
 * tucks under CAP, the way usefr.com sets FRONT / RUNNER.
 *
 * The bars are pre-rendered SVGs (scripts/generate-wordmark.html) used as CSS
 * masks, so the fill comes from `currentColor` and the art scales with its box.
 * Positions are in the SVGs' own units, so the layout scales by percentages.
 */
const CAP = { w: 583.59, h: 240.81 };
const LYTICS = { w: 944.81, h: 240.81 };
// LYTICS's L tucks under the P's bowl, one bar past its stem, and its top sits at about two-thirds of CAP's height.
const LYTICS_X = 476;
const LYTICS_Y = 164;
const BOX = { w: LYTICS_X + LYTICS.w, h: LYTICS_Y + LYTICS.h };

function pct(n: number, of: number) {
  return `${(n / of) * 100}%`;
}

function Word({ src, x, y, w, h }: { src: string; x: number; y: number; w: number; h: number }) {
  const style: CSSProperties = {
    left: pct(x, BOX.w),
    top: pct(y, BOX.h),
    width: pct(w, BOX.w),
    height: pct(h, BOX.h),
    maskImage: `url(${src})`,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
  };
  return <span aria-hidden className="absolute bg-current" style={style} />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative block w-full", className)}
      style={{ aspectRatio: `${BOX.w} / ${BOX.h}` }}
    >
      <span className="sr-only">Caplytics</span>
      <Word src="/wordmark/cap.svg" x={0} y={0} {...CAP} />
      <Word src="/wordmark/lytics.svg" x={LYTICS_X} y={LYTICS_Y} {...LYTICS} />
    </span>
  );
}

/** Where CAP ends, as a fraction of the wordmark's width, so copy can sit beside it. */
export const CAP_END = CAP.w / BOX.w;
