import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { env } from "@/lib/env";

/** Dev/test outbox for contact messages: one JSON line each. Never used when an email provider is configured. */
export const CONTACT_DEV_OUTBOX = ".data/contact-outbox.jsonl";

/** One line of text: trimmed, with line breaks and runs of spaces collapsed, so a field can't forge a second line. */
const line = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max));

export const contactSchema = z.object({
  name: line(120).pipe(z.string().min(1, "Enter your name.")),
  email: line(254).pipe(z.email("Enter a valid email address.")),
  company: line(160).pipe(z.string().min(1, "Enter your company.")),
  role: line(120),
  message: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(10, "Tell us a little more (at least 10 characters).").max(4000, "Keep it under 4,000 characters.")),
});
export type ContactMessage = z.infer<typeof contactSchema>;
export type ContactField = keyof ContactMessage;

export class ContactNotConfigured extends Error {
  override name = "ContactNotConfigured";
}

/** True when a message can be delivered: a mailbox is set, and there is a provider (or the dev outbox). */
export function contactConfigured(): boolean {
  const { CONTACT_TO, RESEND_API_KEY, MAIL_DEV_OUTBOX } = env();
  return Boolean(CONTACT_TO) && (Boolean(RESEND_API_KEY) || process.env.NODE_ENV !== "production" || MAIL_DEV_OUTBOX === "1");
}

/**
 * Delivers a contact message to the owner's mailbox, with the sender as Reply-To so a reply goes straight to them.
 * Throws when it could not be handed to the provider: the form then says so, rather than thanking someone for a
 * message nobody will read.
 */
export async function sendContactMessage(m: ContactMessage, now = new Date()): Promise<void> {
  const { CONTACT_TO, RESEND_API_KEY, MAIL_FROM, MAIL_DEV_OUTBOX } = env();
  if (!CONTACT_TO) throw new ContactNotConfigured("CONTACT_TO is not set");
  const text = [
    `From: ${m.name} <${m.email}>`,
    `Company: ${m.company}`,
    ...(m.role ? [`Role: ${m.role}`] : []),
    `Sent: ${now.toISOString()}`,
    "",
    m.message,
    "",
    "Reply to this email to answer them directly.",
  ].join("\n");
  if (!RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production" && MAIL_DEV_OUTBOX !== "1") throw new ContactNotConfigured("RESEND_API_KEY is not set");
    await mkdir(".data", { recursive: true });
    await appendFile(CONTACT_DEV_OUTBOX, JSON.stringify({ to: CONTACT_TO, replyTo: m.email, text, at: now.toISOString() }) + "\n");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to: CONTACT_TO, reply_to: m.email, subject: `Proofshot enquiry from ${m.company}`, text }),
  });
  if (!res.ok) throw new Error(`email provider responded ${res.status}`);
}
