import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { carriers, magicLinkTokens, sessions, users } from "../db/schema";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SessionUser {
  userId: string;
  email: string;
  carrierId: string;
  carrierName: string;
}

/** Issues a single-use sign-in token for a known Carrier User. Unknown emails return null (callers must not reveal this). */
export async function issueMagicLink(db: Db, email: string, now = new Date()): Promise<string | null> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user) return null;
  const token = newToken();
  await db.insert(magicLinkTokens).values({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS),
  });
  return token;
}

/** Atomically consumes a magic-link token and opens a session. Returns the session token, or null if invalid, used or expired. */
export async function redeemMagicLink(db: Db, token: string, now = new Date()): Promise<string | null> {
  const [claimed] = await db
    .update(magicLinkTokens)
    .set({ usedAt: now })
    .where(and(eq(magicLinkTokens.tokenHash, hashToken(token)), isNull(magicLinkTokens.usedAt), gt(magicLinkTokens.expiresAt, now)))
    .returning({ userId: magicLinkTokens.userId });
  if (!claimed) return null;
  const sessionToken = newToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(sessionToken),
    userId: claimed.userId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return sessionToken;
}

export async function sessionUser(db: Db, sessionToken: string, now = new Date()): Promise<SessionUser | null> {
  const [row] = await db
    .select({ userId: users.id, email: users.email, carrierId: carriers.id, carrierName: carriers.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(carriers, eq(carriers.id, users.carrierId))
    .where(and(eq(sessions.tokenHash, hashToken(sessionToken)), gt(sessions.expiresAt, now)));
  return row ?? null;
}

export async function endSession(db: Db, sessionToken: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(sessionToken)));
}
