"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { issueMagicLink, redeemMagicLink } from "@/server/auth/core";
import { sendMagicLinkEmail } from "@/server/auth/mail";
import { clearSession, setSessionCookie } from "@/server/auth/session";
import { clientKey } from "@/server/client-key";
import { getDb } from "@/server/db";
import { consume } from "@/server/rate-limit";

export interface SignInState {
  status: "idle" | "sent" | "invalid" | "limited";
}

/** Per address and per network: stops email bombing a Carrier User and scripted token issuance. */
const PER_CLIENT = 20;
const HOUR = 60 * 60 * 1000;

export async function requestSignIn(_: SignInState, form: FormData): Promise<SignInState> {
  const email = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { status: "invalid" };
  const db = await getDb();
  // Limits apply whether or not the account exists, so they reveal nothing about it.
  const [byEmail, byClient] = await Promise.all([
    consume(db, `signin:email:${email.data}`, env().SIGNIN_LIMIT_PER_EMAIL, HOUR),
    consume(db, `signin:client:${clientKey(await headers())}`, PER_CLIENT, HOUR),
  ]);
  if (!byEmail.allowed || !byClient.allowed) return { status: "limited" };
  const token = await issueMagicLink(db, email.data);
  if (token) {
    const url = new URL("/auth/verify", env().APP_URL);
    url.searchParams.set("token", token);
    await sendMagicLinkEmail(email.data, url.toString());
  }
  // Same response whether or not the account exists.
  return { status: "sent" };
}

export async function completeSignIn(form: FormData) {
  const session = await redeemMagicLink(await getDb(), String(form.get("token") ?? ""));
  if (!session) redirect("/auth/verify?error=expired");
  await setSessionCookie(session);
  redirect("/console");
}

export async function signOut() {
  await clearSession();
  redirect("/console/sign-in");
}
