import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.41"],
  devIndicators: false,
  transpilePackages: ["@music-apps/shared"],
};

export default nextConfig;
