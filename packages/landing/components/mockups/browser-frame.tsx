import type { ReactNode } from "react";

const dotColors = ["bg-red-400", "bg-amber-400", "bg-emerald-400"];

export function BrowserFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        {dotColors.map((color) => (
          <span key={color} className={`size-2.5 rounded-full ${color}`} />
        ))}
      </div>
      {children}
    </div>
  );
}
