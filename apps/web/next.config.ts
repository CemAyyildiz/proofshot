import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@proofshot/shared", "@proofshot/fingerprint"],
  // PGlite locates its WASM and data bundle via import.meta.url, which bundling breaks.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
