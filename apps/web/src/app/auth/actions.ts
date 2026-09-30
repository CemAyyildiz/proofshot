"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { DEMO_SESSION_TTL_MS, issueMagicLink, openDemoSession, redeemMagicLink } from "@/server/auth/core";
import { signInAllowed } from "@/server/auth/limits";
import { sendMagicLinkEmail } from "@/server/auth/mail";
import { clearSession, setSessionCookie } from "@/server/auth/session";
import { clientKey } from "@/server/client-key";
import { getDb } from "@/server/db";
import { consume } from "@/server/rate-limit";

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

/** One tap into a seeded demo carrier's Console (DEMO_ACCESS=1 only). */
export async function enterDemo(form: FormData) {
  if (env().DEMO_ACCESS !== "1") redirect("/console/sign-in");
  const db = await getDb();
  if (!(await consume(db, `demo:${clientKey(await headers())}`, 20, 60 * 60 * 1000)).allowed) redirect("/console/sign-in?demo=limited");
  const session = await openDemoSession(db, String(form.get("carrier") ?? ""));
  if (!session) redirect("/console/sign-in");
  await setSessionCookie(session, DEMO_SESSION_TTL_MS);
  redirect("/console");
}

export async function signOut() {
  await clearSession();
  redirect("/console/sign-in");
}
