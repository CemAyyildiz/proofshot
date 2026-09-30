import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next resolves this to a no-op under the react-server condition; tests run server code directly.
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Embedded Postgres start-up is CPU-bound; leave headroom when the monorepo runs suites in parallel.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    maxWorkers: 4,
    include: ["src/**/*.test.ts?(x)"],
    exclude: ["e2e/**", "node_modules/**"],
    // Server code only: pages and client components are covered by the Playwright suite. The floor sits a little
    // under the measured values (2026-09-30: lines 80%, branches 89%) so a regression fails CI, not a rounding blip.
    coverage: {
      provider: "v8",
      include: ["src/server/**"],
      exclude: ["**/*.test.ts", "src/server/test-db.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 75, branches: 85, functions: 75, statements: 75 },
    },
  },
});
