import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import sharp from "sharp";
import { signedInPage } from "./helpers";

async function oldClaimPhoto(seed: number) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let shapes = "";
  for (let i = 0; i < 70; i++) {
    const c = `rgb(${(rnd() * 255) | 0},${(rnd() * 255) | 0},${(rnd() * 255) | 0})`;
    shapes += `<rect x="${rnd() * 1024}" y="${rnd() * 768}" width="${30 + rnd() * 200}" height="${30 + rnd() * 200}" fill="${c}" transform="rotate(${rnd() * 40 - 20})"/>`;
  }
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="100%" height="100%" fill="#9a8b7c"/>${shapes}</svg>`))
    .jpeg({ quality: 90 })
    .toBuffer();
}

test("FR-13: imported history makes duplicate detection work before any policyholder uses Proofshot", async ({ browser }) => {
  test.setTimeout(90_000);
  const history = await oldClaimPhoto(4242);
  const dana = await signedInPage(browser, "dana@harbor.demo");

  await dana.getByRole("link", { name: "Import history" }).click();
  await dana.getByLabel("Choose images or a zip file").setInputFiles({
    name: "2024-claims.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "claims/2024-0117.jpg": new Uint8Array(history), "claims/readme.txt": new TextEncoder().encode("x") })),
  });
  await expect(dana.getByRole("status")).toHaveText("Import complete: 1 of 1 processed · 1 imported", { timeout: 30_000 });
  // One import at a time: the pickers are usable again only once it has finished.
  await expect(dana.getByLabel("Choose images or a zip file")).toBeEnabled();

  // A new claim arrives with a forwarded copy of that old photo.
  await dana.goto("/console");
  await dana.getByLabel("Claim reference").fill("HB-2026-NEW");
  await dana.getByRole("button", { name: "Create Claim File" }).click();
  await dana.getByLabel("Upload an image to verify in this Claim File").setInputFiles({
    name: "new-claim.jpg",
    mimeType: "image/jpeg",
    buffer: await sharp(history).resize(900).jpeg({ quality: 65 }).toBuffer(),
  });
  const alerts = dana.getByRole("region", { name: /Duplicate Alerts/ });
  await expect(alerts).toContainText("Team upload 1 matches");
  await expect(alerts).toContainText("Imported record (unsigned) · same carrier");
  const evidence = dana.getByRole("region", { name: "Evidence" });
  await expect(evidence).toContainText("Derived Copy");
  await expect(evidence).toContainText("imported (unsigned)");
  await expect(evidence).not.toContainText("Original");
});
