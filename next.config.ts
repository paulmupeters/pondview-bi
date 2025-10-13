import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverComponentsExternalPackages: ["bun:sqlite"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("bun:sqlite");
    }
    return config;
  },
};

export default nextConfig;
