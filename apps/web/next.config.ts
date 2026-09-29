import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * No third-party origins at all. 'unsafe-inline' scripts are needed without nonces (Next's inline bootstrap);
 * 'wasm-unsafe-eval' lets the browser compile the PDQ fingerprinting WebAssembly; dev adds 'unsafe-eval' for React.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Claim Link tokens live in the URL: never send them to the explorer or any other site.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  transpilePackages: ["@proofshot/shared", "@proofshot/fingerprint"],
  // PGlite locates its WASM and data bundle via import.meta.url, which bundling breaks.
  // Server code reads the PDQ binary from public/ at runtime; make sure deployments ship it with the functions.
  outputFileTracingIncludes: { "/**": ["./public/pdq.wasm"] },
  serverExternalPackages: ["@electric-sql/pglite", "heic-decode", "libheif-js"],
};

export default nextConfig;
