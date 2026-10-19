// Run before the standalone server starts (see the Dockerfile's CMD), not through Next's build —
// `instrumentation.ts` gets webpack-bundled even with `serverExternalPackages` set, and `pg`'s
// `pgpass` dependency needs `fs`, which that bundle doesn't have. `pg` resolves fine here from the
// standalone output's traced `node_modules`, same as `app/page.tsx` at request time. `@caplytics/core`
// does not: webpack inlines it straight into the route bundle at build time since it isn't in
// `serverExternalPackages`, so standalone tracing never copies its `dist/` as a runtime dependency —
// the Dockerfile copies it explicitly, and this imports it by relative path rather than as a package.
import { Pool } from "pg";
import { migrate } from "../../core/dist/postgres/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("caplytics-dashboard: DATABASE_URL is required to migrate.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  const { applied } = await migrate(pool);
  if (applied.length > 0) {
    console.log(`caplytics-dashboard: applied migrations ${applied.join(", ")}`);
  }
} finally {
  await pool.end();
}
