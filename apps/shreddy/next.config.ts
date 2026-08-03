import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.18", "riot-negligent-lasso.ngrok-free.dev"],
  devIndicators: false,
  transpilePackages: ["@music-apps/shared"],
  basePath: "/shreddy",
};

export default nextConfig;
