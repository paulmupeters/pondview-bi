import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: [
    "bun:sqlite",
    "drizzle-orm/bun-sqlite",
    "@duckdb/node-bindings",
    "@duckdb/node-api",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native bindings so Webpack (when used) doesn't try to bundle them
      config.externals.push(
        "bun:sqlite",
        "drizzle-orm/bun-sqlite",
        "@duckdb/node-bindings",
        "@duckdb/node-api"
      );
    }
    return config;
  },
};

export default nextConfig;
