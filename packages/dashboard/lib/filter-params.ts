import type { EventFilter } from "@caplytics/core/postgres";

/**
 * Filter state lives in the URL, and the URL maps onto `EventFilter` unmodified (§8.4).
 *
 * There is deliberately no dashboard-side filter schema: anything the filter bar can express is
 * something `query()` already accepts, so a filter cannot drift from what the query layer supports.
 * A shareable, reloadable URL falls out of that rather than being built separately.
 */
export type FilterSearchParams = {
  from?: string;
  to?: string;
  /** Repeatable: several agents are matched as "any of" (§8.4 — `EventFilter.agentId` takes a list). */
  agent?: string | string[];
  /** Repeatable `key:value` pairs — arbitrary keys, per §6.1. */
  meta?: string | string[];
  /** Opaque keyset position (§8.5); decoded by lib/cursor.ts, never built by hand. */
  cursor?: string;
};

const METADATA_SEPARATOR = ":";

export function toEventFilter(params: FilterSearchParams): EventFilter {
  const metadata = parseMetadata(params.meta);
  const agents = parseAgents(params.agent);

  return {
    ...(isPresent(params.from) ? { from: params.from } : {}),
    ...(isPresent(params.to) ? { to: exclusiveEndOfDay(params.to) } : {}),
    ...(agents.length > 0 ? { agentId: agents } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

/**
 * A user picking "to: 5 August" means through the end of the 5th.
 *
 * `EventFilter.to` is exclusive so adjacent ranges tile exactly, so the day has to be advanced —
 * otherwise the last day a user selected is silently missing from their own results.
 */
function exclusiveEndOfDay(date: string): string {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString();
}

export function parseMetadata(raw: string | string[] | undefined): Record<string, string> {
  const pairs = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const metadata: Record<string, string> = {};

  for (const pair of pairs) {
    const separator = pair.indexOf(METADATA_SEPARATOR);
    // Values may contain the separator; keys may not. Splitting on the first occurrence keeps
    // `customerId:cus_1` and `path:/a:/b` both meaningful.
    if (separator <= 0) continue;

    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key.length > 0 && value.length > 0) metadata[key] = value;
  }

  return metadata;
}

export function parseAgents(raw: string | string[] | undefined): string[] {
  const agents = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return agents.map((agent) => agent.trim()).filter((agent) => agent.length > 0);
}

export function formatMetadataPair(key: string, value: string): string {
  return `${key}${METADATA_SEPARATOR}${value}`;
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
