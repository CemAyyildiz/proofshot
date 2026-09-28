import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { sealAndSendPhoto, signedInPage } from "./helpers";

test.setTimeout(120_000);

test("UJ-3: another carrier's copy raises a Duplicate Alert that reveals nothing about the first carrier", async ({ browser }) => {
  const marcus = await signedInPage(browser, "marcus@northwind.demo");
  const { file } = await sealAndSendPhoto(marcus, browser, "NW-HAIL-UJ3");

  // Dana at Harbor receives a WhatsApp-compressed copy of the same photo in a new claim.
  const dana = await signedInPage(browser, "dana@harbor.demo");
  await dana.getByLabel("Claim reference").fill("HB-RING-7");
  await dana.getByRole("button", { name: "Create Claim File" }).click();
  await expect(dana.getByRole("heading", { name: "HB-RING-7" })).toBeVisible();
  const t0 = Date.now();
  await dana.getByLabel("Upload an image to verify in this Claim File").setInputFiles({
    name: "from-email.jpg",
    mimeType: "image/jpeg",
    buffer: await sharp(file).resize(800).jpeg({ quality: 60 }).toBuffer(),
  });
  const alerts = dana.getByRole("region", { name: /Duplicate Alerts/ });
  await expect(alerts).toContainText("another carrier");
  expect(Date.now() - t0).toBeLessThan(10_000); // FR-12: within 10 s
  await expect(alerts).toContainText("Match strength");
  await expect(dana.getByRole("region", { name: "Evidence" })).toContainText("Derived Copy");

  // Nothing about Northwind, its claim or its image leaks into Harbor's view.
  const text = await dana.locator("main").innerText();
  expect(text).not.toMatch(/Northwind|NW-HAIL-UJ3|marcus/i);
  await expect(dana.locator(`img[src*="/captures/"]`)).toHaveCount(0);
});

test("UJ-2: an adjuster drops in an edited version and gets Altered with a Tile Map", async ({ browser }) => {
  const marcus = await signedInPage(browser, "marcus@northwind.demo");
  const { file, claimUrl } = await sealAndSendPhoto(marcus, browser, "NW-UJ2");
  await marcus.goto(claimUrl);
  const edited = await sharp(file)
    .composite([{ input: Buffer.from('<svg width="960" height="720"><ellipse cx="600" cy="450" rx="110" ry="80" fill="#202020"/></svg>') }])
    .jpeg({ quality: 90 })
    .toBuffer();
  await marcus.getByLabel("Upload an image to verify in this Claim File").setInputFiles({ name: "better.jpg", mimeType: "image/jpeg", buffer: edited });
  const evidence = marcus.getByRole("region", { name: "Evidence" });
  await expect(evidence.getByText("Altered")).toBeVisible({ timeout: 15_000 });
  await expect(evidence.getByRole("figure")).toContainText(/\d+ of 16 regions differ from the sealed photo/);
  // Other claims' photos of this scene are duplicates; the file's own sealed photo is never flagged against itself.
  await expect(marcus.getByRole("region", { name: /Duplicate Alerts/ })).not.toContainText("Identical file");
});

test("a new Seal of a scene already sealed at another carrier raises an alert in the new Claim File", async ({ browser }) => {
  const marcus = await signedInPage(browser, "marcus@northwind.demo");
  await sealAndSendPhoto(marcus, browser, "NW-FIRST");
  const dana = await signedInPage(browser, "dana@harbor.demo");
  const { claimUrl } = await sealAndSendPhoto(dana, browser, "HB-REFILE");
  await dana.goto(claimUrl);
  await expect(dana.getByRole("region", { name: /Duplicate Alerts/ })).toContainText("A policyholder photo in this file matches a photo sealed");
  await expect(dana.getByRole("region", { name: /Duplicate Alerts/ })).toContainText("another carrier");
});
