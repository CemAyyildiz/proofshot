import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { E2E_REGISTRY, E2E_RPC } from "../playwright.config";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { sealAndSendPhoto, signIn } from "./helpers";

const TITLES = { original: "Original", "derived-copy": "Derived Copy", altered: "Altered", "no-record": "No Record" } as const;
const tmp = mkdtempSync(join(tmpdir(), "ps-cli-"));

/** FR-10: the open-source CLI, reading only the chain, must reach the same Verdict as the Public Verifier. */
function cliVerdict(name: string, buffer: Buffer): string {
  const file = join(tmp, name);
  writeFileSync(file, buffer);
  const out = execFileSync(resolve("../../node_modules/.bin/tsx"), [resolve("../../cli/src/index.ts"), file, "--rpc", E2E_RPC, "--registry", E2E_REGISTRY, "--json"], {
    encoding: "utf8",
  });
  return TITLES[(JSON.parse(out) as { verdict: keyof typeof TITLES }).verdict];
}

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
});
