"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { issueMagicLink, redeemMagicLink } from "@/server/auth/core";
import { signInAllowed } from "@/server/auth/limits";
import { sendMagicLinkEmail } from "@/server/auth/mail";
import { clearSession, setSessionCookie } from "@/server/auth/session";
import { clientKey } from "@/server/client-key";
import { getDb } from "@/server/db";

export interface SignInState {
  status: "idle" | "sent" | "invalid" | "limited";
}


export async function requestSignIn(_: SignInState, form: FormData): Promise<SignInState> {
  const email = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { status: "invalid" };
  const db = await getDb();
  // Stops email bombing a Carrier User; applied whether or not the account exists, so it reveals nothing.
  if (!(await signInAllowed(db, email.data, clientKey(await headers()), env().SIGNIN_LIMIT_PER_EMAIL))) return { status: "limited" };
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
