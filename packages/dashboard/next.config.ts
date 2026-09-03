import { join } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // This app lives in a workspace and depends on a linked package. Without the monorepo root as the
  // trace root, standalone output traces only this directory and ships without @caplytics/core.
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  // §8.7 ships this as a Docker image, so the build must produce a self-contained server rather
  // than something that assumes a platform around it.
  output: "standalone",
  // `pg` opens TCP sockets; bundling it into the server build breaks it.
  serverExternalPackages: ["pg"],
};

export default config;
