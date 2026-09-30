import { afterEach, describe, expect, it, vi } from "vitest";

const envValues = { RESEND_API_KEY: undefined as string | undefined, MAIL_DEV_OUTBOX: "0", MAIL_FROM: "Proofshot <login@proofshot.app>" };
vi.mock("@/lib/env", () => ({ env: () => envValues }));
const { mailConfigured, sendMagicLinkEmail, MailNotConfigured } = await import("./mail");

afterEach(() => {
  vi.unstubAllEnvs();
  envValues.RESEND_API_KEY = undefined;
  envValues.MAIL_DEV_OUTBOX = "0";
});

describe("sign-in email configuration", () => {
  it("a production build without a provider reports itself unconfigured and refuses to log links", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(mailConfigured()).toBe(false);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendMagicLinkEmail("a@b.example", "https://x/auth/verify?token=secret")).rejects.toBeInstanceOf(MailNotConfigured);
    expect(log).not.toHaveBeenCalled();
  });

  it("is configured with a provider key, in development, or for tests that opt into the outbox", () => {
    vi.stubEnv("NODE_ENV", "production");
    envValues.RESEND_API_KEY = "re_test";
    expect(mailConfigured()).toBe(true);
    envValues.RESEND_API_KEY = undefined;
    envValues.MAIL_DEV_OUTBOX = "1";
    expect(mailConfigured()).toBe(true);
    envValues.MAIL_DEV_OUTBOX = "0";
    vi.stubEnv("NODE_ENV", "development");
    expect(mailConfigured()).toBe(true);
  });
});
