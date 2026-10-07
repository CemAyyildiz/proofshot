import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const envValues = {
  CONTACT_TO: "owner@example.test" as string | undefined,
  RESEND_API_KEY: "re_test" as string | undefined,
  MAIL_FROM: "Proofshot <login@proofshot.test>",
  MAIL_DEV_OUTBOX: "0",
};
vi.mock("@/lib/env", () => ({ env: () => envValues }));
const { ContactNotConfigured, contactConfigured, contactSchema, sendContactMessage } = await import("./contact");

const valid = { name: "Ada Okafor", email: "ada@harbor.example", company: "Harbor Insurance", role: "SIU lead", message: "We see edited hail photos every week." };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  envValues.CONTACT_TO = "owner@example.test";
  envValues.RESEND_API_KEY = "re_test";
});

describe("contact form", () => {
  it("requires a name, a real email, a company and a message; the role is optional", () => {
    expect(contactSchema.safeParse({ ...valid, role: "" }).success).toBe(true);
    const bad = contactSchema.safeParse({ name: " ", email: "not-an-email", company: "", role: "", message: "hi" });
    expect(bad.success).toBe(false);
    if (bad.success) return;
    expect(Object.keys(z(bad.error)).sort()).toEqual(["company", "email", "message", "name"]);
  });

  it("collapses line breaks in one-line fields, so a name can't add lines to the email", () => {
    const parsed = contactSchema.parse({ ...valid, name: "Ada\nCompany: Someone Else", company: "Harbor\r\nInsurance" });
    expect(parsed.name).toBe("Ada Company: Someone Else");
    expect(parsed.company).toBe("Harbor Insurance");
  });

  it("sends to the owner's mailbox with the sender as Reply-To", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendContactMessage(contactSchema.parse(valid), new Date("2026-10-07T12:00:00Z"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: "owner@example.test", reply_to: "ada@harbor.example", from: "Proofshot <login@proofshot.test>", subject: "Proofshot enquiry from Harbor Insurance" });
    expect(body.text).toContain("From: Ada Okafor <ada@harbor.example>");
    expect(body.text).toContain("Role: SIU lead");
    expect(body.text).toContain("We see edited hail photos every week.");
  });

  it("fails loudly when the provider refuses, and when no mailbox or provider is set", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(sendContactMessage(contactSchema.parse(valid))).rejects.toThrow("email provider responded 403");
    envValues.CONTACT_TO = undefined;
    expect(contactConfigured()).toBe(false);
    await expect(sendContactMessage(contactSchema.parse(valid))).rejects.toBeInstanceOf(ContactNotConfigured);
    envValues.CONTACT_TO = "owner@example.test";
    envValues.RESEND_API_KEY = undefined;
    vi.stubEnv("NODE_ENV", "production");
    expect(contactConfigured()).toBe(false);
    await expect(sendContactMessage(contactSchema.parse(valid))).rejects.toBeInstanceOf(ContactNotConfigured);
    envValues.RESEND_API_KEY = "re_test";
    expect(contactConfigured()).toBe(true);
  });
});

/** Field → first message, the shape the form shows. */
function z(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}
