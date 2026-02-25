import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/core", "@repo/trpc", "@repo/supabase"],
  allowedDevOrigins: [
    "http://100.119.109.24:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ],
};

export default nextConfig;
