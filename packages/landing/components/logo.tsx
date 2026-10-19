import type { SVGProps } from "react";

/** A capped bar-chart mark: spend climbing toward a hard limit. */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M2 21h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="4" y="13" width="3.5" height="8" fill="currentColor" />
      <rect x="10.25" y="9" width="3.5" height="12" fill="currentColor" />
      <rect x="16.5" y="4" width="3.5" height="17" fill="currentColor" />
      <path
        d="M3 4h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="1 2.6"
      />
    </svg>
  );
}
