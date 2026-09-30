import { expect, test } from "@playwright/test";
import { createClaimLink, lastLinkFor, signIn } from "./helpers";

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
  await expect(capturer.getByText("Northwind Mutual", { exact: true })).toBeVisible();
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
  // Irreversible: a second, explicit confirmation is required and Cancel gets focus.
  const confirm = page.getByRole("group", { name: /Revoke this link\?/ });
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Revoke link" }).click();
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
  // The session cookie is invisible to scripts and cross-site requests; in production it is host-locked (__Host-).
  const [cookie] = (await page.context().cookies()).filter((c) => c.name.endsWith("ps_session"));
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(cookie!.domain).not.toMatch(/^\./);
  if (process.env.E2E_PROD) expect(cookie).toMatchObject({ name: "__Host-ps_session", secure: true });
  const other = await (await browser.newContext()).newPage();
  await other.goto(lastLinkFor("marcus@northwind.demo"));
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByRole("heading", { name: "This sign-in link is no longer valid" })).toBeVisible();
});

test("judges can enter a demo carrier's Console with one tap, clearly labelled as a demo", async ({ page }) => {
  await page.goto("/console/sign-in");
  const demo = page.getByRole("region", { name: "Explore the demo Console" });
  await demo.getByRole("button", { name: /Harbor Insurance/ }).click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByText(/Demo workspace · Harbor Insurance is a fictional carrier/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Claim Files" })).toBeVisible();
});

test("an adjuster finds a Claim File by reference among many", async ({ page }) => {
  await signIn(page, "dana@harbor.demo");
  const stamp = Date.now().toString(36).toUpperCase();
  for (const ref of [`FLOOD-${stamp}-A`, `FLOOD-${stamp}-B`, `THEFT-${stamp}`]) {
    await page.goto("/console");
    await createClaimLink(page, ref);
  }
  await page.goto("/console");
  await page.getByRole("searchbox", { name: "Find a Claim File" }).fill(`flood-${stamp.toLowerCase()}`);
  await page.getByRole("button", { name: "Search" }).click();
  const rows = page.getByRole("table").getByRole("rowheader");
  await expect(rows).toHaveText([`FLOOD-${stamp}-B`, `FLOOD-${stamp}-A`]);
  await page.getByRole("searchbox", { name: "Find a Claim File" }).fill(`nothing-${stamp}`);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(`No Claim Files match “nothing-${stamp}”.`)).toBeVisible();
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/console$/);
});
