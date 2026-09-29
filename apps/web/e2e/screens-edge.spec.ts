import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addVirtualPasskeyAuthenticator, createClaimLink, signedInPage, simulateSensorNoise } from "./helpers";

/** Edge-case layouts for design review: 320 px, landscape, very long references. Run with SCREENS=1. */
test.skip(!process.env.SCREENS, "screenshots only on demand");
test.setTimeout(180_000);

const OUT = "test-results/screens";
const LONG_REF = "CLM-2026-" + "HAILDAMAGEAUTOGLASSWINDSCREEN".repeat(3).slice(0, 71);

test("edge layouts", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const marcus = await signedInPage(browser, "marcus@northwind.demo");
  const link = await createClaimLink(marcus, LONG_REF);
  await marcus.setViewportSize({ width: 1280, height: 800 });
  await marcus.screenshot({ path: `${OUT}/edge-d-claim-longref.png`, fullPage: true });
  await marcus.goto("/console");
  await marcus.screenshot({ path: `${OUT}/edge-d-list-longref.png`, fullPage: true });

  for (const [w, h, tag] of [
    [320, 568, "320"],
    [812, 375, "landscape"],
  ] as const) {
    const phone = await (await browser.newContext({ viewport: { width: w, height: h }, permissions: ["camera"], isMobile: true, hasTouch: true })).newPage();
    await addVirtualPasskeyAuthenticator(phone);
    await simulateSensorNoise(phone);
    await phone.goto(link);
    await phone.screenshot({ path: `${OUT}/edge-${tag}-intro.png` });
    await phone.getByRole("button", { name: "Continue" }).click();
    await expect(phone.getByRole("button", { name: "Take photo" })).toBeEnabled();
    await phone.getByRole("button", { name: "Take photo" }).click();
    await expect(phone.getByRole("list", { name: "Your photos" }).getByRole("status")).toHaveText(/Sealed ✓/, { timeout: 30_000 });
    await phone.screenshot({ path: `${OUT}/edge-${tag}-capture.png` });
    await phone.goto("/verify");
    await phone.screenshot({ path: `${OUT}/edge-${tag}-verify.png`, fullPage: true });
    await phone.goto("/");
    await phone.screenshot({ path: `${OUT}/edge-${tag}-landing.png` });
  }
});
