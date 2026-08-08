import type { SqlExecutor } from "@caplytics/core/postgres";
import { Pool } from "pg";
import { env } from "./env";

/**
 * One pool per process, reused across requests.
 *
 * `pg.Pool` satisfies `SqlExecutor` structurally, so the dashboard hands the query layer the client
 * it already has — the same shape the integration tests exercise, with no adapter between them.
 */
let pool: Pool | undefined;

export function database(): SqlExecutor {
  pool ??= new Pool({ connectionString: env().DATABASE_URL });
  return pool;
}
