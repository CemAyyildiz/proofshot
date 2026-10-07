import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** An insurer who wants to talk to us: the message reaches the owner's mailbox, and mistakes cost no retyping. */
test("the contact form validates, keeps what was typed and delivers the message", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Your name").fill("Ada Okafor");
  await page.getByLabel("Work email").fill("not-an-email");
  await page.getByLabel("Company").fill("Harbor Insurance");
  const stamp = `e2e-${Date.now()}`;
  await page.getByLabel(/How do claim photos reach your team/).fill(`Edited hail photos arrive by WhatsApp every week. ${stamp}`);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Ada Okafor");
  await expect(page.getByLabel(/How do claim photos reach your team/)).toHaveValue(new RegExp(stamp));

  await page.getByLabel("Work email").fill("ada@harbor.example");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText("will reply to ada@harbor.example");

  const sent = readFileSync(".data/contact-outbox.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; replyTo: string; text: string });
  const mine = sent.find((m) => m.text.includes(stamp));
  expect(mine).toMatchObject({ to: "owner@proofshot.test", replyTo: "ada@harbor.example" });
  expect(mine!.text).toContain("Company: Harbor Insurance");
});

test("an address that leads nowhere gets a real page with a way back", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "No record of this page" })).toBeVisible();
  await page.getByRole("link", { name: "Go to the home page" }).click();
  await expect(page).toHaveURL(/\/$/);
});
