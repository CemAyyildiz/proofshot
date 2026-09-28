import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_RPC = "http://127.0.0.1:8546";
/** Deterministic: first contract deployed by Anvil account #0 on a fresh chain. */
export const E2E_REGISTRY = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // One dev server, one database and one mail outbox are shared by every test.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
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
      command: `rm -rf .data/e2e .data/outbox.jsonl && pnpm db:seed && pnpm dev --port ${PORT}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: "pglite:./.data/e2e",
        APP_URL: `http://localhost:${PORT}`,
        RESEND_API_KEY: "",
        PROOFSHOT_NETWORK: "local",
        RPC_URL: E2E_RPC,
        REGISTRY_ADDRESS: E2E_REGISTRY,
        RELAYER_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      },
    },
  ],
});
