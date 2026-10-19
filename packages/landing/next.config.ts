import { join } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Static marketing content — ship standalone like the dashboard so both deploy the same way.
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  output: "standalone",
};

export default config;
