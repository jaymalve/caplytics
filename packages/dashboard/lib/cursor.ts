import type { EventCursor } from "@caplytics/core/postgres";

/**
 * A cursor is two values (§8.5), and the URL carries one string.
 *
 * Encoded rather than exposed as two params so a caller cannot construct half a cursor: a
 * timestamp without its tiebreaker is exactly the broken pagination keyset ordering exists to
 * prevent.
 */
const SEPARATOR = "~";

export function encodeCursor(cursor: EventCursor): string {
  return `${cursor.timestamp}${SEPARATOR}${cursor.id}`;
}

/** Undefined for anything malformed — a bad cursor shows the first page, never a server error. */
export function decodeCursor(raw: string | undefined): EventCursor | undefined {
  if (raw === undefined) return undefined;

  const separator = raw.indexOf(SEPARATOR);
  if (separator <= 0) return undefined;

  const timestamp = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (id.length === 0 || Number.isNaN(Date.parse(timestamp))) return undefined;

  return { timestamp, id };
}
