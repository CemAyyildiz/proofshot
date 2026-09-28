import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@proofshot/shared", "@proofshot/fingerprint"],
};

export default nextConfig;
