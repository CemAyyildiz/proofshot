import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { addVirtualPasskeyAuthenticator, createClaimLink, sealAndSendPhoto, signedInPage, simulateSensorNoise } from "./helpers";

/** Design-review screenshots of every surface at phone and desktop widths. Run with SCREENS=1. */
test.skip(!process.env.SCREENS, "screenshots only on demand");
test.setTimeout(240_000);

const OUT = "test-results/screens";
const shot = async (page: import("@playwright/test").Page, name: string) => {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};

test("capture all surfaces", async ({ browser }) => {
  for (const [w, h, tag] of [
    [375, 812, "m"],
    [1280, 800, "d"],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto("/");
    await shot(p, `${tag}-landing`);
    await p.goto("/verify");
    await shot(p, `${tag}-verify-empty`);
    await p.goto("/console/sign-in");
    await shot(p, `${tag}-signin`);
    await p.goto("/try");
    await shot(p, `${tag}-try`);
    await ctx.close();
  }

  // Try-it on a phone, after the first Seal: the "Now try to fool it" guide.
  const visitor = await (await browser.newContext({ viewport: { width: 375, height: 812 }, permissions: ["camera"] })).newPage();
  await addVirtualPasskeyAuthenticator(visitor);
  await simulateSensorNoise(visitor);
  await visitor.goto("/try");
  await visitor.getByRole("button", { name: "Start the demo" }).click();
  await visitor.getByRole("button", { name: "Continue" }).click();
  await visitor.getByRole("button", { name: "Take photo" }).click();
  await expect(visitor.getByRole("list", { name: "Your photos" }).getByRole("status")).toHaveText(/^Sealed/, { timeout: 30_000 });
  await shot(visitor, "m-try-sealed");

  const marcus = await signedInPage(browser, "marcus@northwind.demo");
  await marcus.setViewportSize({ width: 1280, height: 800 });
  const { file, claimUrl, exactHash } = await sealAndSendPhoto(marcus, browser, "AUTO-2026-0042");
  await marcus.goto("/console");
  await shot(marcus, "d-console-list");
  await marcus.goto(claimUrl);
  const edited = await sharp(file)
    .composite([{ input: Buffer.from('<svg width="960" height="720"><ellipse cx="600" cy="450" rx="110" ry="80" fill="#202020"/></svg>') }])
    .jpeg({ quality: 90 })
    .toBuffer();
  await marcus.getByLabel("Upload an image to verify in this Claim File").setInputFiles({ name: "e.jpg", mimeType: "image/jpeg", buffer: edited });
  await expect(marcus.getByRole("region", { name: "Evidence" }).getByText("Altered")).toBeVisible({ timeout: 20_000 });
  await shot(marcus, "d-console-claim");
  await marcus.goto("/console/imports");
  await shot(marcus, "d-console-imports");

  // Capturer flow on a phone.
  const phone = await (await browser.newContext({ viewport: { width: 375, height: 812 }, permissions: ["camera"], isMobile: true, hasTouch: true })).newPage();
  await addVirtualPasskeyAuthenticator(phone);
  await simulateSensorNoise(phone);
  await marcus.goto("/console");
  const link = await createClaimLink(marcus, "HAIL-SCREENS");
  await phone.goto(link);
  await shot(phone, "m-capture-intro");
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await shot(phone, "m-capture-ready");
  await phone.getByRole("button", { name: "Take photo" }).click();
  await phone.getByRole("button", { name: "Take photo" }).click();
  await expect(phone.getByRole("list", { name: "Your photos" }).getByRole("status").first()).toHaveText(/^Sealed/, { timeout: 30_000 });
  await shot(phone, "m-capture-sealed");
  await phone.getByRole("button", { name: /Send .* to insurer/ }).click();
  await shot(phone, "m-capture-sent");

  // Verifier results on a phone.
  for (const [name, buf] of [
    ["original", file],
    ["derived", await sharp(file).resize(800).jpeg({ quality: 60 }).toBuffer()],
    ["altered", edited],
    ["crop", await sharp(file).extract({ left: 10, top: 7, width: 940, height: 706 }).jpeg().toBuffer()],
  ] as const) {
    await phone.goto("/verify");
    await phone.locator("#verify-file").setInputFiles({ name: `${name}.jpg`, mimeType: "image/jpeg", buffer: buf });
    await expect(phone.getByRole("heading", { name: /^Verdict:/ })).toBeAttached({ timeout: 20_000 });
    await shot(phone, `m-verify-${name}`);
  }
  await phone.getByRole("link", { name: "Open Verification Receipt" }).click();
  await phone.waitForURL(/\/v\//);
  await expect(phone.getByRole("heading", { name: /^Verdict:/ })).toBeAttached();
  const receiptUrl = phone.url();
  await shot(phone, "m-receipt-verification");
  await phone.goto(`/r/${exactHash}`);
  await shot(phone, "m-receipt-seal");

  // Desktop receipts and dark mode.
  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await desk.goto(receiptUrl);
  await shot(desk, "d-receipt-verification");
  await desk.goto(`/r/${exactHash}`);
  await shot(desk, "d-receipt-seal");
  // As printed or saved to PDF for a claim file (A4 width at 96 dpi).
  await desk.setViewportSize({ width: 794, height: 1123 });
  await desk.emulateMedia({ media: "print" });
  await shot(desk, "print-receipt-seal");
  await desk.goto(receiptUrl);
  await shot(desk, "print-receipt-verification");
  await desk.emulateMedia({ media: "screen" });
  await desk.setViewportSize({ width: 1280, height: 800 });
  const dark = await (await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: "dark" })).newPage();
  for (const [path, name] of [
    ["/", "landing"],
    ["/verify", "verify-empty"],
    [receiptUrl, "receipt-verification"],
  ] as const) {
    await dark.goto(path);
    await shot(dark, `dark-${name}`);
  }
  const darkConsole = await signedInPage(browser, "marcus@northwind.demo");
  await darkConsole.emulateMedia({ colorScheme: "dark" });
  await darkConsole.setViewportSize({ width: 1280, height: 800 });
  await darkConsole.goto(claimUrl);
  await expect(darkConsole.getByRole("region", { name: "Evidence" }).getByText("Altered")).toBeVisible();
  await shot(darkConsole, "dark-d-console-claim");
});
