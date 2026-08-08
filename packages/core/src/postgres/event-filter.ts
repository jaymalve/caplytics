export type EventFilter = {
  /** Inclusive lower bound, ISO-8601. */
  readonly from?: string;
  /** Exclusive upper bound, so adjacent ranges neither overlap nor drop an event between them. */
  readonly to?: string;
  readonly agentId?: string;
  readonly runId?: string;
  /**
   * Every pair must match (§6.2). Keys are arbitrary business data — caplytics does not validate
   * them against a fixed set.
   */
  readonly metadata?: Readonly<Record<string, string>>;
};

export type WhereClause = {
  readonly sql: string;
  readonly params: readonly unknown[];
};

/**
 * Builds the shared `WHERE` for both the listing and the aggregate, so the number on a summary and
 * the rows behind it can never disagree about what was filtered.
 *
 * Values are always bound as parameters, never interpolated: metadata keys come from user data, and
 * an interpolated one is an injection waiting to happen.
 */
export function buildWhere(filter: EventFilter, startAt = 1): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const bind = (value: unknown): string => {
    params.push(value);
    return `$${startAt + params.length - 1}`;
  };

  if (filter.from !== undefined) conditions.push(`timestamp >= ${bind(filter.from)}`);
  if (filter.to !== undefined) conditions.push(`timestamp < ${bind(filter.to)}`);
  if (filter.agentId !== undefined) conditions.push(`agent_id = ${bind(filter.agentId)}`);
  if (filter.runId !== undefined) conditions.push(`run_id = ${bind(filter.runId)}`);

  // Containment rather than per-key equality: one indexable predicate the GIN jsonb_path_ops index
  // serves directly, instead of N unindexed comparisons.
  if (filter.metadata !== undefined && Object.keys(filter.metadata).length > 0) {
    conditions.push(`metadata @> ${bind(JSON.stringify(filter.metadata))}::jsonb`);
  }

  return {
    sql: conditions.length === 0 ? "TRUE" : conditions.join(" AND "),
    params,
  };
}
