# caplytics-landing

The public marketing site. Root [CLAUDE.md](../../CLAUDE.md) covers everything not specific to this package.

## Why this is a separate package from `caplytics-dashboard`

The dashboard is auth-gated end-to-end — middleware plus an `auth()` check on every page. A marketing page is public by definition, so it cannot live inside that app without carving an exception into its auth model. One responsibility per package, same as one responsibility per file (root §9.4).

It imports nothing from `@caplytics/core` or `caplytics-dashboard` — no database, no auth, no query layer. Everything here is static content.

## Content is illustrative, not live

The budget and event-table mockups (`components/mockups/`) are hand-built JSX dressed as a product screenshot, not a connection to real data. If the dashboard's actual UI changes shape, these drift — there is no shared component between the two apps to keep them in sync by construction. Revisit this if that drift becomes a real maintenance cost.

## UI

Same rule as the dashboard: shadcn components for anything shadcn provides (root §9.3). `components/ui/` is vendored by `shadcn add` and excluded from lint, same as in `caplytics-dashboard`.

## Tests

None yet — the page is static content with no logic to unit-test. If this package grows data-dependent behavior, root §9.6 applies like everywhere else.
