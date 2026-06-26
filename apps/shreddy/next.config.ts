import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.18"],
  devIndicators: false,
  transpilePackages: ["@music-apps/shared"],
  basePath: "/shreddy",
};

export default nextConfig;
