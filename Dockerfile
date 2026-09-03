# §8.7: the dashboard ships as an image, so this builds the whole workspace and keeps only the
# standalone server. Two stages, because the build needs Bun and the toolchain while the runtime
# needs neither.

FROM oven/bun:1.3-alpine AS builder
WORKDIR /repo

# Manifests first: dependencies only reinstall when they actually change, not on every source edit.
COPY package.json bun.lock* ./
COPY packages/core/package.json packages/core/
COPY packages/caplytics/package.json packages/caplytics/
COPY packages/dashboard/package.json packages/dashboard/
# The example is a workspace member, so the lockfile references it. Its manifest has to be present
# for --frozen-lockfile to resolve, even though nothing in the image uses it.
COPY examples/support-agent/package.json examples/support-agent/
RUN bun install --frozen-lockfile

COPY tsconfig.base.json biome.json ./
COPY packages ./packages

# The dashboard resolves @caplytics/core through its built dist, so core builds first.
RUN bun run --filter '@caplytics/core' build

# Build-time placeholders only. Every one is read at runtime through lib/env.ts, which refuses to
# start when they are missing — baking real values into an image would leak them to anyone who
# pulls it.
ENV DATABASE_URL=postgres://build-placeholder \
    AUTH_SECRET=build-placeholder \
    GOOGLE_CLIENT_ID=build-placeholder \
    GOOGLE_CLIENT_SECRET=build-placeholder \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run --filter caplytics-dashboard build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Never root: the server needs no privileges, and a container that has them is one bug from the host.
RUN addgroup --system --gid 1001 caplytics \
 && adduser --system --uid 1001 --ingroup caplytics caplytics

# Standalone output already contains the traced production dependencies; static assets and the
# public directory are the two things it does not copy for you.
COPY --from=builder --chown=caplytics:caplytics /repo/packages/dashboard/.next/standalone ./
COPY --from=builder --chown=caplytics:caplytics /repo/packages/dashboard/.next/static ./packages/dashboard/.next/static

USER caplytics
EXPOSE 3000

# Reports unhealthy while the app is up but not serving, which a process check cannot see.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/dashboard/server.js"]
