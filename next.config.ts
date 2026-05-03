import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp uses native binaries — must be kept external so Vercel bundles
  // the pre-compiled Lambda binary rather than trying to compile from source.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
