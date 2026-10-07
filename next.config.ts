import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" is for self-hosted/container runs. On Vercel (VERCEL=1)
  // the platform builds and serves Next.js itself, so the extra output
  // is unnecessary.
  output: process.env.VERCEL ? undefined : "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
