import { existsSync, readFileSync } from "node:fs";
import { type Page, expect } from "@playwright/test";

function outbox(): { to: string; url: string }[] {
  if (!existsSync(".data/outbox.jsonl")) return [];
  return readFileSync(".data/outbox.jsonl", "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function lastLinkFor(email: string): string {
  const hit = outbox().reverse().find((l) => l.to === email);
  if (!hit) throw new Error(`no email to ${email}`);
  return hit.url;
}

export async function signIn(page: Page, email: string) {
  await page.goto("/console");
  await expect(page).toHaveURL(/\/console\/sign-in$/);
  const sent = outbox().length;
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("sign-in link is on its way");
  await expect.poll(() => outbox().slice(sent).some((m) => m.to === email)).toBe(true);
  await page.goto(lastLinkFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
}

export async function createClaimLink(page: Page, reference: string): Promise<string> {
  await page.getByLabel("Claim reference").fill(reference);
  await page.getByRole("button", { name: "Create Claim File" }).click();
  await expect(page.getByRole("heading", { name: reference })).toBeVisible();
  return page.getByRole("textbox", { name: "Claim Link" }).inputValue();
}

/** A Chrome virtual platform authenticator with user verification, standing in for Face ID / fingerprint. */
export async function addVirtualPasskeyAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}
