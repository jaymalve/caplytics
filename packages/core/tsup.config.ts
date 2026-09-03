import { defineConfig } from "tsup";

// Two entrypoints, not one: `caplytics` imports the root entry for enforcement and must not
// pull a Postgres driver in with it. See architecture/core-subpath-exports.md.
export default defineConfig({
  entry: ["src/index.ts", "src/postgres/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
});
