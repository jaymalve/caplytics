"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Every filter control edits the URL, and the URL is the query (§8.4).
 *
 * Shared so each control mutates the same params the server reads, and so any change drops the
 * page cursor: a cursor is a position in one filtered ordering, and carrying it into another skips
 * rows (§8.5).
 */
export function useFilterNavigation() {
  const router = useRouter();
  const params = useSearchParams();

  function apply(mutate: (next: URLSearchParams) => void): void {
    const next = new URLSearchParams(params.toString());
    next.delete("cursor");
    mutate(next);
    router.push(next.size === 0 ? "/" : `/?${next.toString()}`);
  }

  function replaceAll(key: string, values: readonly string[]): void {
    apply((next) => {
      next.delete(key);
      for (const value of values) next.append(key, value);
    });
  }

  return { params, apply, replaceAll };
}
