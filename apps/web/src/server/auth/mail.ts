import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import { env } from "@/lib/env";

/** Dev/test outbox: one JSON line per email, read by e2e tests. Never used when a provider is configured. */
export const DEV_OUTBOX = ".data/outbox.jsonl";

export class MailNotConfigured extends Error {
  override name = "MailNotConfigured";
}

/**
 * Sends the sign-in link via Resend when configured. Without a provider, development (and tests that opt in with
 * MAIL_DEV_OUTBOX=1) print the link; a production build refuses, so a missing key can never put live sign-in tokens
 * into server logs.
 */
export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const { RESEND_API_KEY, MAIL_FROM, MAIL_DEV_OUTBOX } = env();
  if (!RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production" && MAIL_DEV_OUTBOX !== "1") {
      console.error("[auth] RESEND_API_KEY is not set; sign-in email not sent");
      throw new MailNotConfigured("Sign-in email is not configured");
    }
    console.info(`[auth] magic link for ${to}: ${url}`);
    await mkdir(".data", { recursive: true });
    await appendFile(DEV_OUTBOX, JSON.stringify({ to, url, at: new Date().toISOString() }) + "\n");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to,
      subject: "Your Proofshot sign-in link",
      text: `Sign in to the Proofshot Carrier Console:\n\n${url}\n\nThis link works once and expires in 15 minutes. If you did not request it, ignore this email.`,
    }),
  });
  if (!res.ok) throw new Error(`email provider responded ${res.status}`);
}
