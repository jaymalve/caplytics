# @caplytics/core

Shared internals for [caplytics](https://www.npmjs.com/package/caplytics): the event schema, cost
model, budget ledger and query layer.

Most people want the [`caplytics`](https://www.npmjs.com/package/caplytics) SDK instead. Install this
directly only to read or query stored spend without the agent SDK — a dashboard, a reporting job, a
billing export.

```ts
import { querySpend } from "@caplytics/core/postgres";
import { Pool } from "pg";

const spend = await querySpend(new Pool({ connectionString: process.env.DATABASE_URL }), {
  metadata: { customerId: "cus_18213" },
  from: "2026-07-01",
  to: "2026-08-01",
});
// { totalCost: 42.18, callCount: 340, byAgent: {...}, unpricedCount: 0 }
```

The root entry is pure — no database driver, no network client. Everything that touches Postgres
lives behind `@caplytics/core/postgres`, so agent code never installs a driver it will not use.

Full documentation: https://github.com/jaymalave/caplytics
