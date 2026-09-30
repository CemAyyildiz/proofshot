import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** E2E_PROD=1 runs the suite against `next build && next start`: bundling and production-only CSP are covered. */
const PROD = !!process.env.E2E_PROD;
export const E2E_RPC = "http://127.0.0.1:8546";
/** Deterministic: first contract deployed by Anvil account #0 on a fresh chain. */
export const E2E_REGISTRY = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // Test files run on two workers against one dev server, database, chain and mail outbox. Every test uses its own
  // Claim Files and references; the only shared-account race (two workers signing in as one demo user) is retried in
  // helpers.signIn. Measured 2026-09-30: 3/3 clean runs, ~50 s instead of ~66 s.
  workers: 2,
  // CI retries once to collect a trace of the first failure, but a test that only passes on retry still fails the
  // run: a hidden flake is how a real timing bug (a button measured mid-fade by axe) once went unnoticed.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  forbidOnly: !!process.env.CI,
  // `github` annotates the failing lines on the PR; `html` is what the workflow uploads on failure.
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? undefined : "chrome",
        // Chrome's fake camera plays a textured scene (generated in globalSetup) in place of the rear camera.
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-video-capture=${resolve("e2e/fixtures/camera.y4m")}`,
          ],
        },
        permissions: ["camera"],
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @proofshot/contracts dev:chain",
      port: 8546,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ANVIL_PORT: "8546", ANVIL_STATE: "none", ENV_OUT: "none" },
    },
    {
      stdout: "pipe",
      command: `rm -rf .data/e2e .data/storage .data/outbox.jsonl && pnpm db:seed && ${PROD ? `pnpm build && pnpm start --port ${PORT}` : `pnpm dev --port ${PORT}`}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: PROD ? 300_000 : 120_000,
      env: {
        DATABASE_URL: "pglite:./.data/e2e",
        APP_URL: `http://localhost:${PORT}`,
        RESEND_API_KEY: "",
        SIGNIN_LIMIT_PER_EMAIL: "1000",
        SIGNIN_LIMIT_PER_CLIENT: "1000",
        DEMO_CLAIM_FILES_PER_VISITOR: "1000",
        MAIL_DEV_OUTBOX: "1",
        DEMO_ACCESS: "1",
        PROOFSHOT_NETWORK: "local",
        RPC_URL: E2E_RPC,
        REGISTRY_ADDRESS: E2E_REGISTRY,
        RELAYER_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      },
    },
  ],
});
