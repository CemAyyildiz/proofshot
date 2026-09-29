import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import sharp from "sharp";
import { addVirtualPasskeyAuthenticator, createClaimLink, sealAndSendPhoto, signedInPage, simulateSensorNoise } from "./helpers";

test.setTimeout(120_000);

/** WCAG 2.1 A/AA automated checks (axe). Manual checks — keyboard flow, focus visibility — live in other specs. */
async function audit(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, `axe violations on ${name}`).toEqual([]);
}

test("public pages meet WCAG 2.1 AA (automated)", async ({ browser }) => {
  for (const scheme of ["light", "dark"] as const) {
    const page = await (await browser.newContext({ colorScheme: scheme })).newPage();
    for (const path of ["/", "/verify", "/try", "/console/sign-in"]) {
      await page.goto(path);
      await audit(page, `${path} (${scheme})`);
    }
  }
});

test("Console, capture, verdicts and receipts meet WCAG 2.1 AA (automated)", async ({ browser }) => {
  const marcus = await signedInPage(browser, "marcus@northwind.demo");
  const { file, claimUrl, exactHash } = await sealAndSendPhoto(marcus, browser, "A11Y-1");
  await marcus.goto("/console");
  await audit(marcus, "console list");
  await marcus.goto(claimUrl);
  const edited = await sharp(file)
    .composite([{ input: Buffer.from('<svg width="960" height="720"><ellipse cx="600" cy="450" rx="110" ry="80" fill="#202020"/></svg>') }])
    .jpeg({ quality: 90 })
    .toBuffer();
  await marcus.getByLabel("Upload an image to verify in this Claim File").setInputFiles({ name: "e.jpg", mimeType: "image/jpeg", buffer: edited });
  await expect(marcus.getByRole("region", { name: "Evidence" }).getByText("Altered")).toBeVisible({ timeout: 20_000 });
  await audit(marcus, "console claim file");
  await marcus.goto("/console/imports");
  await audit(marcus, "imports");

  const phone = await (await browser.newContext({ viewport: { width: 375, height: 812 }, permissions: ["camera"] })).newPage();
  await addVirtualPasskeyAuthenticator(phone);
  await simulateSensorNoise(phone);
  await marcus.goto("/console");
  await phone.goto(await createClaimLink(marcus, "A11Y-2"));
  await audit(phone, "capture intro");
  await phone.getByRole("button", { name: "Continue" }).click();
  await phone.getByRole("button", { name: "Take photo" }).click();
  await expect(phone.getByRole("list", { name: "Your photos" }).getByRole("status")).toHaveText(/Sealed ✓/, { timeout: 30_000 });
  await audit(phone, "capture with photos");

  for (const [name, buf] of [
    ["altered", edited],
    ["original", file],
  ] as const) {
    await phone.goto("/verify");
    await phone.locator("#verify-file").setInputFiles({ name: `${name}.jpg`, mimeType: "image/jpeg", buffer: buf });
    await expect(phone.getByRole("heading", { name: /^Verdict:/ })).toBeAttached({ timeout: 20_000 });
    await audit(phone, `verdict ${name}`);
  }
  await phone.getByRole("link", { name: "Open Verification Receipt" }).click();
  await phone.waitForURL(/\/v\//);
  await audit(phone, "verification receipt");
  await phone.goto(`/r/${exactHash}`);
  await audit(phone, "seal receipt");
});
