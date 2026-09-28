import { registryAbi } from "@proofshot/shared";
import { expect, test } from "@playwright/test";
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { E2E_REGISTRY, E2E_RPC } from "../playwright.config";
import { addVirtualPasskeyAuthenticator, createClaimLink, signIn } from "./helpers";

const chain = createPublicClient({ chain: foundry, transport: http(E2E_RPC) });

test("a Capturer sets up a passkey from a Claim Link and it is registered onchain", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const link = await createClaimLink(page, "HAIL-E2E-1");

  const phone = await (await browser.newContext()).newPage();
  await addVirtualPasskeyAuthenticator(phone);
  await phone.goto(link);
  await expect(phone.getByText("Northwind Mutual")).toBeVisible();
  await expect(phone.getByText("Claim HAIL-E2E-1")).toBeVisible();

  const forbidden = /wallet|gas|token|chain|transaction|blockchain/i;
  expect(await phone.locator("main").innerText()).not.toMatch(forbidden);

  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByRole("status")).toHaveText("Ready to take photos.");
  expect(await phone.locator("main").innerText()).not.toMatch(forbidden);

  const keyId = await phone.evaluate(() => JSON.parse(localStorage.getItem("proofshot.deviceKey.v1")!).keyId as `0x${string}`);
  await expect
    .poll(async () => (await chain.readContract({ address: E2E_REGISTRY, abi: registryAbi, functionName: "deviceKey", args: [keyId] })).qx)
    .not.toBe(`0x${"0".repeat(64)}`);

  // Returning Capturer on the same device: no second setup.
  await phone.reload();
  await expect(phone.getByRole("status")).toHaveText("Ready to take photos.");
});

test("a browser without a platform authenticator gets a clear, specific message", async ({ page, browser }) => {
  await signIn(page, "marcus@northwind.demo");
  const link = await createClaimLink(page, "HAIL-E2E-2");
  const phone = await (await browser.newContext()).newPage();
  await phone.addInitScript(() => {
    Object.defineProperty(window, "PublicKeyCredential", { value: undefined });
  });
  await phone.goto(link);
  await expect(phone.getByText(/This browser can.t seal photos/)).toHaveText(/Open this link in Safari on iPhone \(iOS 17 or later\) or Chrome on Android \(13 or later\)/);
});
