import { readFileSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { addVirtualPasskeyAuthenticator, simulateSensorNoise } from "./helpers";

test("FR-18: a visitor's phone reaches a ready camera in ≤ 3 taps, seals a photo and is guided to fool the verifier", async ({ browser }) => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  const phone = await (await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, permissions: ["camera"] })).newPage();
  await addVirtualPasskeyAuthenticator(phone);
  await simulateSensorNoise(phone);

  await phone.goto("/");
  let taps = 0;
  await phone.getByRole("button", { name: "Try it on this phone" }).click();
  taps++;
  await phone.getByRole("button", { name: "Continue" }).click(); // then the passkey prompt
  taps++;
  await expect(phone.getByRole("button", { name: "Take photo" })).toBeEnabled();
  expect(taps).toBeLessThanOrEqual(3);
  await expect(phone.getByRole("heading", { name: "Take a photo of anything nearby" })).toBeVisible();
  await expect(phone.getByRole("button", { name: /Send .* to insurer/ })).toHaveCount(0);

  await phone.getByRole("button", { name: "Take photo" }).click();
  await expect(phone.getByRole("list", { name: "Your photos" }).getByRole("status")).toHaveText(/Sealed ✓/, { timeout: 30_000 });
  const guide = phone.getByRole("region", { name: "Now try to fool it" });
  await expect(guide).toBeVisible();
  // The guide is the point of the demo: it scrolls into view instead of waiting below the viewfinder.
  await expect(guide).toBeInViewport();

  const [download] = await Promise.all([phone.waitForEvent("download"), guide.getByRole("link", { name: "Save your sealed photo" }).click()]);
  const saved = readFileSync((await download.path())!);

  await phone.goto("/verify");
  await phone.locator("#verify-file").setInputFiles({ name: "mine.jpg", mimeType: "image/jpeg", buffer: saved });
  await expect(phone.getByRole("heading", { name: "Verdict: Original" })).toBeAttached({ timeout: 15_000 });
});

test("desktop visitors get a QR code that continues on a phone", async ({ page }) => {
  const res = await page.goto("/");
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["referrer-policy"]).toBe("same-origin");
  expect(h["x-powered-by"]).toBeUndefined();

  // Health covers the relayer's balance and the Registry's pause state (uptime monitors alert on 503).
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body).toMatchObject({ ok: true, registryPaused: false, problems: [] });
  expect(body.relayerBalanceMon).toBeGreaterThan(1);
  await expect(page.getByRole("img", { name: /QR code for .*\/try$/ })).toBeVisible();
  // A typeable fallback for cameras that won't scan it.
  await expect(page.getByRole("complementary", { name: "Try it on your phone" })).toContainText("localhost:3100/try");
  await page.goto("/try");
  await expect(page.getByRole("button", { name: "Start the demo" })).toBeVisible();
});
