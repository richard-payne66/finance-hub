import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp uses native binaries — must be kept external so Vercel bundles
  // the pre-compiled Lambda binary rather than trying to compile from source.
  serverExternalPackages: ["sharp"],
  // The migrations runner reads db/*.sql at request time via fs.readFile.
  // Vercel's bundler doesn't include arbitrary folders unless asked.
  outputFileTracingIncludes: {
    "/api/migrations": ["./db/**/*.sql"],
  },
};

export default nextConfig;
