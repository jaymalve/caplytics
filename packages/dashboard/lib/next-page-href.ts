import type { EventCursor } from "@caplytics/core/postgres";
import { encodeCursor } from "./cursor";

/** Current filters are carried forward, so paging does not silently reset them. */
export function nextPageHref(
  searchParams: Record<string, string | string[] | undefined>,
  cursor: EventCursor,
): string {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "cursor" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) next.append(key, item);
  }
  next.set("cursor", encodeCursor(cursor));

  return `/?${next.toString()}`;
}
