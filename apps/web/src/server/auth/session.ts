import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db";
import { SESSION_TTL_MS, endSession, sessionUser, type SessionUser } from "./core";

export const SESSION_COOKIE = "ps_session";

export async function setSessionCookie(token: string, ttlMs = SESSION_TTL_MS) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlMs / 1000,
  });
}

/** Current Carrier User, memoised per request. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sessionUser(await getDb(), token) : null;
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/console/sign-in");
  return session;
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await endSession(await getDb(), token);
  store.delete(SESSION_COOKIE);
}
