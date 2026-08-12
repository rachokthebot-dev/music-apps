import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.18", "Rachoks-Mac-mini.local", "riot-negligent-lasso.ngrok-free.dev"],
  devIndicators: false,
  transpilePackages: ["@music-apps/shared"],
  basePath: "/lickbank",
};

export default nextConfig;
