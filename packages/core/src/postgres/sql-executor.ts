export type SqlRows<T> = { rows: T[] };

/**
 * The minimum this package needs from a Postgres client.
 *
 * Structurally satisfied by `pg`'s `Pool` and `Client`, so a caller passes the one they already
 * have. Declaring the shape rather than depending on a driver keeps `@caplytics/core` free of a
 * native dependency that agent code — the majority of installs — never uses, and leaves the choice
 * of driver, pooling and instrumentation with the application.
 */
export type SqlExecutor = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlRows<T>>;
};
