import { and, isNotNull, lt, or } from "drizzle-orm";
import type { Db } from "./db/client";
import { magicLinkTokens, rateLimits, sessions } from "./db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes rows that can never matter again: rate-limit windows older than two days (the longest window is one day),
 * expired sessions, and sign-in tokens that expired or were used more than a day ago. Receipts (verifications),
 * evidence and Registry data are kept.
 */
export async function pruneExpired(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - 2 * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const [rl, se, tk] = await Promise.all([
    db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff)).returning({ b: rateLimits.bucket }),
    db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ t: sessions.tokenHash }),
    db
      .delete(magicLinkTokens)
      .where(or(lt(magicLinkTokens.expiresAt, dayAgo), and(isNotNull(magicLinkTokens.usedAt), lt(magicLinkTokens.usedAt, dayAgo))))
      .returning({ t: magicLinkTokens.tokenHash }),
  ]);
  return { rateLimits: rl.length, sessions: se.length, signInTokens: tk.length };
}
