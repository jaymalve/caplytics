# Self-host is one `docker compose` command, not a `docker run` plus a manual migration

**Implements:** §8.7
**Status:** Accepted — extends §8.7

## Decision

`docker-compose.yml` gains a `dashboard` service behind a `dashboard` profile, alongside the
existing `timescale` service:

```bash
cp .env.example .env   # fill in AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
docker compose --profile dashboard up --build
```

That is the whole self-host path: database up, schema migrated, dashboard serving on `:3000`.

The dashboard migrates its own schema on boot. The Dockerfile's `CMD` runs
`packages/dashboard/scripts/migrate.mjs` — a plain script calling `@caplytics/core/postgres`'s
`migrate()`, already documented there as "safe to call on every boot" — before starting
`server.js`. Calling `migrate(new Pool(...))` by hand, which the README used to require, still works
for anyone running the schema outside the image, but it is no longer a required step.

This is a plain script rather than Next's `instrumentation.ts` hook, which was the first attempt:
Next bundles `instrumentation.ts` through webpack even with `serverExternalPackages: ["pg"]` set,
and `pg`'s `pgpass` dependency requires `fs`, which that bundle doesn't have — the build fails. A
script run directly by Node, outside the Next build, has nothing to bundle. It resolves `pg` from
the standalone output's traced `node_modules`, the same way `app/page.tsx` does at request time.
`@caplytics/core` is the exception: webpack inlines it into the route bundle, so standalone tracing
never copies its `dist/`. The Dockerfile copies `dist/` explicitly and `npm install`s core's runtime
dependencies next to it, and the script imports it by relative path.

## Rationale

§8.7 fixes the distribution mechanism (a Docker image) but stops at `docker run` for the dashboard
alone, leaving the database and the migration as separate, undocumented steps — a self-hoster needs
to already know to run Postgres, apply the schema, and only then start the container, in that order.
That is not "no build step, no local Next.js setup required to run it" in practice, only in theory.

Putting the dashboard behind a Compose **profile** rather than merging it unconditionally into the
default service list matters for a reason unrelated to self-hosting: `bun run db:up` (§7) uses this
same file to start *just* `timescale` for local dev and CI integration tests, which have none of
`AUTH_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` available and should not be asked to
build a Next.js image to run a database. A profile keeps `docker compose up` (no flag) behaving
exactly as it did before this change; `--profile dashboard` opts in explicitly.

Auto-migrating on boot rather than via a separate Compose service (an init container / `migrate`
one-shot) avoids introducing a second image and a `depends_on: condition: service_completed_successfully`
chain for what the migration function already guarantees on its own: idempotent statements under an
advisory lock, safe for two processes — or two replicas — to hit at once.

## Consequences

- `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` are passed through with `${VAR:-}`
  (optional), not `${VAR:?message}` (required) — Compose interpolates every service's environment on
  every invocation regardless of which profile is active, so a required-var failure on `dashboard`
  would break plain `docker compose up` for `bun run db:up` too, which sets none of them. `lib/env.ts`
  already refuses to boot without these; this keeps exactly one place enforcing "required."
- `timescale` gained a named volume (`timescale-data`) so a self-hoster's events survive a restart.
  `bun run db:down` still runs `docker compose down -v` and still drops it — that command's contract
  was already "destroy the dev database," not "destroy the dev database except that one time."
- The image always migrates at startup, including when it runs with plain `docker run` rather than
  Compose. `migrate()` was written to be called on every boot; before this, nothing called it that
  way.
- A failed migration stops the container before the server starts. `CMD` chains the two with `&&`,
  so a dashboard never serves against a schema it could not apply.

## Alternatives considered

- **A separate one-shot `migrate` service** — rejected. Duplicates logic `migrate()` already
  provides (idempotency, advisory locking) in a second image, for no behavior migrating on boot doesn't
  already have.
- **Merge `dashboard` into the default (un-profiled) service list** — rejected. Breaks `bun run
  db:up` for everyone who doesn't have Google OAuth credentials on hand, which is every CI run.
- **A shell script (`./self-host.sh`) wrapping `docker run` twice with manual `--link`/wait logic** —
  rejected. Compose already expresses "wait for healthy," env requirements, and port mapping
  declaratively; a script would re-implement all three worse.
