import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/core", "@repo/trpc", "@repo/supabase"],
};

export default nextConfig;
