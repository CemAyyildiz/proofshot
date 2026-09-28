import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@proofshot/shared", "@proofshot/fingerprint"],
  // PGlite locates its WASM and data bundle via import.meta.url, which bundling breaks.
  // Server code reads the PDQ binary from public/ at runtime; make sure deployments ship it with the functions.
  outputFileTracingIncludes: { "/**": ["./public/pdq.wasm"] },
  serverExternalPackages: ["@electric-sql/pglite", "heic-decode", "libheif-js"],
};

export default nextConfig;
