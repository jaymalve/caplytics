import type { NextConfig } from "next";

const config: NextConfig = {
  // §8.7 ships this as a Docker image, so the build must produce a self-contained server rather
  // than something that assumes a platform around it.
  output: "standalone",
  // `pg` opens TCP sockets; bundling it into the server build breaks it.
  serverExternalPackages: ["pg"],
};

export default config;
