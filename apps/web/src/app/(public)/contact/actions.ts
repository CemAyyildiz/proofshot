"use server";

import { headers } from "next/headers";
import { clientKey } from "@/server/client-key";
import { type ContactField, contactSchema, sendContactMessage } from "@/server/contact";
import { getDb } from "@/server/db";
import { consume } from "@/server/rate-limit";

export interface ContactState {
  status: "idle" | "sent" | "invalid" | "limited" | "failed";
  /** What the person typed, returned on an error so nothing has to be typed twice. */
  values?: Partial<Record<ContactField, string>>;
  errors?: Partial<Record<ContactField, string>>;
  /** Shown in the confirmation. */
  email?: string;
}

/** Messages per visitor per hour: enough for a correction or two, too few to fill a mailbox. */
const CONTACT_LIMIT_PER_HOUR = 5;

export async function sendContact(_: ContactState, form: FormData): Promise<ContactState> {
  const text = (k: string) => String(form.get(k) ?? "");
  const values = { name: text("name"), email: text("email"), company: text("company"), role: text("role"), message: text("message") };
  // A field people never see. Whatever fills it in is a script: answer as if it worked and send nothing.
  if (text("website")) return { status: "sent", email: values.email };
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    const errors: ContactState["errors"] = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as ContactField] ??= issue.message;
    return { status: "invalid", values, errors };
  }
  if (!(await consume(await getDb(), `contact:${clientKey(await headers())}`, CONTACT_LIMIT_PER_HOUR, 60 * 60 * 1000)).allowed) {
    return { status: "limited", values };
  }
  try {
    await sendContactMessage(parsed.data);
  } catch (e) {
    console.error("[contact] message not delivered", e);
    return { status: "failed", values };
  }
  return { status: "sent", email: parsed.data.email };
}
