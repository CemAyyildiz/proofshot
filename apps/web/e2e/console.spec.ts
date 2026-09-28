import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

function lastLinkFor(email: string): string {
  const lines = readFileSync(".data/outbox.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; url: string });
  const hit = lines.reverse().find((l) => l.to === email);
  if (!hit) throw new Error(`no email to ${email}`);
  return hit.url;
}

async function signIn(page: Page, email: string) {
  await page.goto("/console");
  await expect(page).toHaveURL(/\/console\/sign-in$/);
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("sign-in link is on its way");
  await expect.poll(() => { try { return lastLinkFor(email); } catch { return ""; } }).not.toBe("");
  await page.goto(lastLinkFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
}

test("Carrier User creates a Claim File, shares and revokes its link; other Carriers cannot see it", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  await expect(page.getByRole("link", { name: /Proofshot · Northwind Mutual/ })).toBeVisible();

  const t0 = Date.now();
  await page.getByLabel("Claim reference").fill("AUTO-2026-0042");
  await page.getByRole("button", { name: "Create Claim File" }).click();
  await expect(page.getByRole("heading", { name: "AUTO-2026-0042" })).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2000); // FR-1: link within 2 s
  const claimUrl = page.url();
  const link = await page.getByRole("textbox", { name: "Claim Link" }).inputValue();
  expect(link).toMatch(/\/c\/[A-Za-z0-9_-]{32}$/);

  // Capturer view of the active link.
  const capturer = await browser.newPage();
  await capturer.goto(link);
  await expect(capturer.getByText("Northwind Mutual")).toBeVisible();
  await expect(capturer.getByRole("heading", { name: "Take photos of the damage" })).toBeVisible();

  // Another Carrier gets a 404 for the same Claim File.
  const harborCtx = await browser.newContext();
  const harbor = await harborCtx.newPage();
  await signIn(harbor, "dana@harbor.demo");
  await expect(harbor.getByText("AUTO-2026-0042")).toHaveCount(0);
  const res = await harbor.goto(claimUrl);
  expect(res?.status()).toBe(404);

  // Revoke → the Capturer page reports the link inactive.
  await page.getByRole("button", { name: "Revoke link" }).click();
  await expect(page.getByText(/This link is revoked/)).toBeVisible();
  await capturer.reload();
  await expect(capturer.getByRole("heading", { name: "This link is no longer active" })).toBeVisible();
});

test("unknown emails get the same response and no link", async ({ page }) => {
  await page.goto("/console/sign-in");
  await page.getByLabel("Work email").fill("stranger@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("If that address belongs to a Carrier workspace");
  expect(() => lastLinkFor("stranger@example.com")).toThrow();
});

test("a used sign-in link cannot be reused", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const other = await (await browser.newContext()).newPage();
  await other.goto(lastLinkFor("marcus@northwind.demo"));
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByRole("heading", { name: "This sign-in link is no longer valid" })).toBeVisible();
});
