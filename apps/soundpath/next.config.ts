import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.18"],
  devIndicators: false,
  transpilePackages: ["@music-apps/shared", "@music-apps/gain-estimator"],
  basePath: "/soundpath",
};

export default nextConfig;
