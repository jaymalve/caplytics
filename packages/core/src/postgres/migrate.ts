import { MIGRATIONS, MIGRATIONS_TABLE, type Migration } from "./migrations.js";
import type { SqlExecutor } from "./sql-executor.js";

export type MigrationResult = {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
};

/**
 * Brings a database up to the current schema, skipping migrations already applied.
 *
 * Safe to call on every boot: applied ids are recorded, and each statement is independently
 * idempotent besides. Two processes starting at once are serialised by an advisory lock rather
 * than racing to create the same hypertable.
 */
export async function migrate(
  sql: SqlExecutor,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationResult> {
  await sql.query(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    id          TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // An arbitrary but stable key: any process running caplytics migrations takes the same lock, so
  // a second one waits rather than failing halfway through a partially-created schema.
  await sql.query("SELECT pg_advisory_lock($1)", [CAPLYTICS_MIGRATION_LOCK]);

  try {
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const migration of migrations) {
      if (await isApplied(sql, migration.id)) {
        skipped.push(migration.id);
        continue;
      }

      for (const statement of migration.statements) {
        await sql.query(statement);
      }
      await sql.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`, [migration.id]);
      applied.push(migration.id);
    }

    return { applied, skipped };
  } finally {
    await sql.query("SELECT pg_advisory_unlock($1)", [CAPLYTICS_MIGRATION_LOCK]);
  }
}

const CAPLYTICS_MIGRATION_LOCK = 8_151_977;

async function isApplied(sql: SqlExecutor, id: string): Promise<boolean> {
  const result = await sql.query<{ id: string }>(
    `SELECT id FROM ${MIGRATIONS_TABLE} WHERE id = $1`,
    [id],
  );
  return result.rows.length > 0;
}
