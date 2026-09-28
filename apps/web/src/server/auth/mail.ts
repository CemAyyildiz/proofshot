import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import { env } from "@/lib/env";

/** Dev/test outbox: one JSON line per email, read by e2e tests. Never used when a provider is configured. */
export const DEV_OUTBOX = ".data/outbox.jsonl";

/** Sends the sign-in link via Resend when configured; otherwise logs it (local development). */
export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const { RESEND_API_KEY, MAIL_FROM } = env();
  if (!RESEND_API_KEY) {
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
