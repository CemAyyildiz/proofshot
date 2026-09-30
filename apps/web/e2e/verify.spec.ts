import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { E2E_REGISTRY, E2E_RPC } from "../playwright.config";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { registryAbi } from "@proofshot/shared";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import type { CliResult } from "../../../cli/src/index";
import { sealAndSendPhoto, signIn } from "./helpers";

const TITLES = { original: "Original", "derived-copy": "Derived Copy", altered: "Altered", "no-record": "No Record" } as const;
const tmp = mkdtempSync(join(tmpdir(), "ps-cli-"));

/** Runs the open-source CLI, which reads only the chain, on `buffer` and returns its JSON result. */
function cli(name: string, buffer: Buffer): CliResult {
  const file = join(tmp, name);
  writeFileSync(file, buffer);
  const out = execFileSync(resolve("../../node_modules/.bin/tsx"), [resolve("../../cli/src/index.ts"), file, "--rpc", E2E_RPC, "--registry", E2E_REGISTRY, "--json"], {
    encoding: "utf8",
  });
  return JSON.parse(out) as CliResult;
}

/** FR-10: the CLI must reach the same Verdict as the Public Verifier. */
const cliVerdict = (name: string, buffer: Buffer) => TITLES[cli(name, buffer).verdict];

test("the Public Verifier returns one honest Verdict per copy and a public receipt", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page, "marcus@northwind.demo");
  const { exactHash, file } = await sealAndSendPhoto(page, browser, `VERIFY-${Date.now()}`);
  const visitor = await (await browser.newContext()).newPage();

  async function verify(name: string, buffer: Buffer, mimeType = "image/jpeg") {
    await visitor.goto("/verify");
    await visitor.locator("#verify-file").setInputFiles({ name, mimeType, buffer });
    const heading = visitor.getByRole("heading", { name: /^Verdict:/ });
    await expect(heading).toBeAttached({ timeout: 15_000 });
    const web = (await heading.textContent())!.replace("Verdict: ", "");
    expect(cliVerdict(name, buffer), `CLI vs Verifier for ${name}`).toBe(web);
  }
  const panel = () => visitor.getByRole("region", { name: /^Verdict:/ });

  // Identical file → Original, with a Receipt that never shows the image.
  await verify("original.jpg", file);
  await expect(panel()).toContainText("Original");
  await expect(panel()).toContainText("What it does not mean");
  await visitor.getByRole("link", { name: "Open Verification Receipt" }).click();
  await expect(visitor).toHaveURL(/\/v\/[A-Za-z0-9_-]{12}$/);
  await expect(visitor.getByRole("heading", { name: "Verdict: Original" })).toBeAttached();
  await expect(visitor.getByText("Signing Window")).toBeVisible();
  await expect(visitor.getByText("a carrier", { exact: true })).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Verify it yourself" })).toBeVisible();
  await expect(visitor.locator("img")).toHaveCount(0);

  // WhatsApp-style recompression → Derived Copy, alteration check passed.
  await verify("whatsapp.jpg", await sharp(file).resize(800).jpeg({ quality: 60 }).toBuffer());
  await expect(panel()).toContainText("Derived Copy");
  await expect(panel()).toContainText("No regions were changed");

  // A localized edit → Altered with a Tile Map.
  const edited = await sharp(file)
    .composite([{ input: Buffer.from('<svg width="960" height="720"><ellipse cx="360" cy="270" rx="100" ry="70" fill="#1c1c1c"/></svg>') }])
    .jpeg({ quality: 92 })
    .toBuffer();
  await verify("edited.jpg", edited);
  await expect(panel()).toContainText("Altered");
  await expect(visitor.getByRole("figure")).toContainText(/\d+ of 16 regions differ from the sealed photo/);

  // An unrelated image → No Record, explicitly not "fake".
  const unrelated = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#334455" } })
    .composite([{ input: Buffer.from('<svg width="800" height="600"><rect x="100" y="100" width="300" height="200" fill="#e0c060"/><circle cx="600" cy="400" r="120" fill="#aa3355"/></svg>') }])
    .png()
    .toBuffer();
  await verify("other.png", unrelated, "image/png");
  await expect(panel()).toContainText("No Record");
  await expect(panel()).toContainText("does not mean the image is fake");

  // Not an image → specific message, no Verdict.
  await visitor.goto("/verify");
  await visitor.locator("#verify-file").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await expect(visitor.getByText(/isn.t a supported image/)).toBeVisible();

  // The Capture Record's own receipt.
  await visitor.goto(`/r/${exactHash}`);
  await expect(visitor.getByRole("heading", { name: "Sealed photo" })).toBeVisible();
  await expect(visitor.getByText("Device Key")).toBeVisible();
  // Every hash is shown in full: a receipt is audit evidence.
  await expect(visitor.getByRole("definition").filter({ hasText: exactHash })).toBeVisible();

  // Printed or saved as PDF for a claim file: no site navigation or buttons, the receipt's own URL instead, and the
  // Verdict colours kept on the light palette even from a dark-mode browser.
  await visitor.emulateMedia({ media: "print", colorScheme: "dark" });
  await expect(visitor.getByRole("navigation", { name: "Main" })).toBeHidden();
  await expect(visitor.getByRole("button", { name: "Copy command" })).toBeHidden();
  await expect(visitor.getByText(`This receipt online: http://localhost:3100/r/${exactHash}`)).toBeVisible();
  expect(await visitor.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  expect(await visitor.evaluate(() => getComputedStyle(document.documentElement).printColorAdjust)).toBe("exact");
  await visitor.emulateMedia({ media: "screen", colorScheme: null });
  await expect(visitor.getByText(/This receipt online/)).toBeHidden();
});

test("a Seal whose Device Key was later revoked says so on its receipt", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const { exactHash, file } = await sealAndSendPhoto(page, browser, `REVOKE-${Date.now()}`);
  const chain = createPublicClient({ chain: foundry, transport: http(E2E_RPC) });
  const [log] = await chain.getContractEvents({
    address: E2E_REGISTRY,
    abi: registryAbi,
    eventName: "CaptureSealed",
    args: { exactHash: exactHash as `0x${string}` },
    fromBlock: 0n,
  });
  const keyId = log!.args.keyId!;

  // The Registry admin (Anvil account #0 in the dev chain) revokes the key, e.g. after a lost phone.
  const admin = createWalletClient({ chain: foundry, transport: http(E2E_RPC), account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") });
  await chain.waitForTransactionReceipt({ hash: await admin.writeContract({ address: E2E_REGISTRY, abi: registryAbi, functionName: "revokeDeviceKey", args: [keyId] }) });

  await expect(async () => {
    await page.goto(`/r/${exactHash}`);
    await expect(page.getByText(/This Device Key was revoked in block \d+/)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // The Seal itself still stands.
  await expect(page.getByRole("heading", { name: "Sealed photo" })).toBeVisible();

  // Someone checking from the chain alone, without our site, is told the same.
  const { verdict, matched } = cli("revoked.jpg", file);
  expect(verdict).toBe("original");
  expect(matched).toMatchObject({ keyId: keyId.toLowerCase(), keyRevokedAtBlock: expect.stringMatching(/^\d+$/) });
  expect(BigInt(matched!.keyRevokedAtBlock!)).toBeGreaterThan(BigInt(matched!.blockNumber));
});

test("a file picked before the page finished loading is still checked", async ({ page }) => {
  // Hold the JavaScript back, pick the file while the server-rendered input is all there is, then let it load.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/_next/static/**/*.js", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/verify", { waitUntil: "commit" });
  await page.locator("#verify-file").waitFor({ state: "attached" });
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#2a6" } }).png().toBuffer();
  await page.locator("#verify-file").setInputFiles({ name: "early.png", mimeType: "image/png", buffer: png });
  release();
  await expect(page.getByRole("heading", { name: /^Verdict:/ })).toBeAttached({ timeout: 20_000 });
});

test("a temporary failure keeps the chosen file and offers to try it again", async ({ page }) => {
  let first = true;
  await page.route("**/api/verify", async (route) => {
    if (!first) return route.continue();
    first = false;
    await route.fulfill({ status: 503, json: { error: "The public registry is temporarily unreachable, so no Verdict can be given. Try again in a minute." } });
  });
  await page.goto("/verify");
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#4a6" } }).png().toBuffer();
  await page.locator("#verify-file").setInputFiles({ name: "claim-photo.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("alert").filter({ hasText: "temporarily unreachable" })).toBeVisible();
  await page.getByRole("button", { name: "Try again with claim-photo.png" }).click();
  await expect(page.getByRole("heading", { name: /^Verdict:/ })).toBeAttached({ timeout: 20_000 });
});

test("an ordinary phone-size photo (well over 4.5 MB) goes through the production server", async ({ request }) => {
  // Serverless platforms cap request bodies around 4.5 MB; this app must accept the 20 MB it promises (docs/deploy.md).
  const photo = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } })
    .jpeg({ quality: 92 })
    .toBuffer();
  expect(photo.byteLength).toBeGreaterThan(8_000_000);
  const res = await request.post("/api/verify", {
    headers: { "x-forwarded-for": "198.51.100.77" },
    multipart: { file: { name: "big.jpg", mimeType: "image/jpeg", buffer: photo } },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ verdict: "no-record" });
});

test("the Public Verifier rate-limits a single client and unknown receipts are 404", async ({ request }) => {
  const client = { "x-forwarded-for": "203.0.113.77" }; // an isolated client so other tests keep their budget
  const statuses: number[] = [];
  for (let i = 0; i < 31; i++) {
    const res = await request.post("/api/verify", {
      headers: client,
      multipart: { file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") } },
    });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 30).every((s) => s === 415)).toBe(true);
  expect(statuses[30]).toBe(429);

  expect((await request.get("/v/AAAAAAAAAAAA")).status()).toBe(404);
  expect((await request.get(`/r/0x${"0".repeat(64)}`)).status()).toBe(404);
  expect((await request.get("/r/not-a-hash")).status()).toBe(404);
  // The maintenance endpoint is invisible without its secret.
  expect((await request.get("/api/cron/maintenance")).status()).toBe(404);
});

test("keyboard users can reach the verifier's file picker and see where focus is", async ({ page }) => {
  await page.goto("/verify");
  const drop = page.locator('label[for="verify-file"]');
  for (let i = 0; i < 12 && !(await page.locator("#verify-file").evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(page.locator("#verify-file")).toBeFocused();
  const outline = await drop.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});
