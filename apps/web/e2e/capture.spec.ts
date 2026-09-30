import { registryAbi } from "@proofshot/shared";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { E2E_REGISTRY, E2E_RPC } from "../playwright.config";
import { addVirtualPasskeyAuthenticator, createClaimLink, signIn, simulateSensorNoise } from "./helpers";

const chain = createPublicClient({ chain: foundry, transport: http(E2E_RPC) });
const FORBIDDEN = /wallet|\bgas\b|token|blockchain|transaction/i;

async function openAsCapturer(browser: Browser, link: string): Promise<Page> {
  const phone = await (await browser.newContext({ permissions: ["camera"] })).newPage();
  await addVirtualPasskeyAuthenticator(phone);
  await simulateSensorNoise(phone);
  await phone.goto(link);
  return phone;
}

test("a Capturer sets up a passkey, seals a burst of live photos onchain and sends them to the Carrier", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const link = await createClaimLink(page, "HAIL-E2E-1");
  const claimUrl = page.url();

  const phone = await openAsCapturer(browser, link);
  await expect(phone.getByText("Northwind Mutual", { exact: true })).toBeVisible();
  await expect(phone.getByText("Claim HAIL-E2E-1")).toBeVisible();
  expect(await phone.locator("main").innerText()).not.toMatch(FORBIDDEN);

  await phone.getByRole("button", { name: "Continue" }).click();
  const shutter = phone.getByRole("button", { name: "Take photo" });
  await expect(shutter).toBeEnabled();

  // FR-3: live camera only — no file picker, gallery or paste target.
  await expect(phone.locator('input[type="file"]')).toHaveCount(0);

  // Device Key registered onchain.
  const keyId = await phone.evaluate(() => JSON.parse(localStorage.getItem("proofshot.deviceKey.v1")!).keyId as `0x${string}`);
  const key = await chain.readContract({ address: E2E_REGISTRY, abi: registryAbi, functionName: "deviceKey", args: [keyId] });
  expect(key.qx).not.toBe(`0x${"0".repeat(64)}`);

  // FR-5: a burst without waiting for earlier Seals.
  for (let i = 0; i < 3; i++) await shutter.click();
  const photos = phone.getByRole("list", { name: "Your photos" }).getByRole("status");
  await expect(photos).toHaveCount(3);
  await expect(photos.filter({ hasText: /^Sealed ✓ · \d+\.\d s$/ })).toHaveCount(3, { timeout: 30_000 });
  expect(await phone.locator("main").innerText()).not.toMatch(FORBIDDEN);

  // The Carrier sees three sealed Captures before they are sent…
  await page.goto(claimUrl);
  await expect(page.getByText("Sealed, not sent yet")).toHaveCount(3);
  const receipts = await page.getByRole("link", { name: "Receipt" }).evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  for (const href of receipts) {
    const exactHash = href.replace("/r/", "") as `0x${string}`;
    expect(await chain.readContract({ address: E2E_REGISTRY, abi: registryAbi, functionName: "isSealed", args: [exactHash] })).toBe(true);
  }

  // …and receives the exact sealed files once the Capturer sends them (FR-6).
  await phone.getByRole("button", { name: "Send 3 photos to insurer" }).click();
  await expect(phone.getByRole("heading", { name: "Sent to your insurer" })).toBeVisible();
  await expect(phone.getByRole("link", { name: "Receipt" })).toHaveCount(3);
  await page.reload();
  await expect(page.getByText("Photo received")).toHaveCount(3);
  await page.goto("/console");
  await expect(page.getByRole("row", { name: /HAIL-E2E-1/ })).toContainText("Evidence received");

  // Returning Capturer on the same device: no second setup, earlier photos still listed.
  await phone.reload();
  await expect(shutter).toBeEnabled();
  await expect(phone.getByRole("list", { name: "Your photos" }).getByRole("status")).toHaveText(["Sent ✓", "Sent ✓", "Sent ✓"]);
});

test("without camera access the Capturer gets guidance and no alternative input", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const link = await createClaimLink(page, "HAIL-E2E-3");
  const phone = await (await browser.newContext()).newPage();
  await addVirtualPasskeyAuthenticator(phone);
  await phone.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await phone.goto(link);
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByText(/Allow camera access for this site/)).toBeVisible();
  await expect(phone.getByRole("button", { name: "Take photo" })).toBeDisabled();
  await expect(phone.locator('input[type="file"]')).toHaveCount(0);
});

test("a browser without a platform authenticator gets a clear, specific message", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const link = await createClaimLink(page, "HAIL-E2E-2");
  const phone = await (await browser.newContext()).newPage();
  await phone.addInitScript(() => {
    Object.defineProperty(window, "PublicKeyCredential", { value: undefined });
  });
  await phone.goto(link);
  await expect(phone.getByText(/This browser can.t seal photos/)).toHaveText(
    /Open this link in Safari on iPhone \(iOS 17 or later\) or Chrome on Android \(13 or later\)/,
  );
});

test("the viewfinder and shutter fit one screen on a small phone and in landscape", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const link = await createClaimLink(page, "CLM-2026-" + "HAILDAMAGEAUTOGLASSWINDSCREEN".repeat(3).slice(0, 71));
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 812, height: 375 },
  ]) {
    const phone = await (await browser.newContext({ viewport, permissions: ["camera"] })).newPage();
    await addVirtualPasskeyAuthenticator(phone);
    await phone.goto(link);
    await phone.getByRole("button", { name: "Continue" }).click();
    const shutter = phone.getByRole("button", { name: "Take photo" });
    await expect(shutter).toBeEnabled();
    await shutter.scrollIntoViewIfNeeded();
    const preview = await phone.getByLabel("Camera preview").boundingBox();
    const button = await shutter.boundingBox();
    expect(button!.y + button!.height - preview!.y, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.height);
    // No horizontal scrolling, even with an 80-character unbroken claim reference.
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await phone.context().close();
  }
});

test("a frame the camera fails to deliver once is retried, not reported to the Capturer", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const link = await createClaimLink(page, "HAIL-RETRY-1");
  const phone = await (await browser.newContext({ permissions: ["camera"] })).newPage();
  await addVirtualPasskeyAuthenticator(phone);
  await simulateSensorNoise(phone);
  // The first JPEG encode of the page yields no image, as Chrome's toBlob can under memory pressure.
  await phone.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let failed = false;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
      if (!failed && rest[0] === "image/jpeg") {
        failed = true;
        return setTimeout(() => callback(null), 0) as unknown as void;
      }
      return original.call(this, callback, ...rest);
    };
  });
  await phone.goto(link);
  await phone.getByRole("button", { name: "Continue" }).click();
  await phone.getByRole("button", { name: "Take photo" }).click();
  await expect(phone.getByRole("list", { name: "Your photos" }).getByRole("status")).toHaveText(/Sealed ✓/, { timeout: 30_000 });
  await expect(phone.getByText("The camera didn't return a photo")).toHaveCount(0);
  await phone.context().close();
});

test("offline: a plain message, the photo is kept, and it seals by itself when the connection returns", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const phone = await openAsCapturer(browser, await createClaimLink(page, "HAIL-OFFLINE-1"));
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await phone.context().setOffline(true);
  await phone.getByRole("button", { name: "Take photo" }).click();
  const photos = phone.getByRole("list", { name: "Your photos" });
  await expect(photos).toContainText("No connection. This photo is kept on your phone", { timeout: 15_000 });
  await expect(photos).not.toContainText(/Failed to fetch|TypeError|network/i);
  await phone.context().setOffline(false);
  await expect(photos.getByRole("status")).toHaveText(/Sealed ✓/, { timeout: 30_000 });
  await phone.context().close();
});

test("a link revoked mid-session stops new photos with a clear next step; sealed photos stay", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const phone = await openAsCapturer(browser, await createClaimLink(page, "HAIL-REVOKED-1"));
  await phone.getByRole("button", { name: "Continue" }).click();
  await phone.getByRole("button", { name: "Take photo" }).click();
  await expect(phone.getByRole("list", { name: "Your photos" }).getByRole("status")).toHaveText(/Sealed ✓/, { timeout: 30_000 });

  await page.getByRole("button", { name: "Revoke link" }).click();
  await page.getByRole("group", { name: /Revoke this link\?/ }).getByRole("button", { name: "Revoke link" }).click();
  await expect(page.getByText(/This link is revoked/)).toBeVisible();

  await phone.getByRole("button", { name: "Take photo" }).click();
  await expect(phone.getByRole("alert").filter({ hasText: "This link is no longer active" })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByRole("button", { name: "Take photo" })).toBeDisabled();
  await expect(phone.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(phone.getByRole("list", { name: "Your photos" }).getByText(/Sealed ✓/)).toHaveCount(1);
  await phone.context().close();
});
