import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { rateLimits } from "./db/schema";

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fixed-window counter. Atomically adds `amount` to `bucket` for the window containing `now` and reports whether the
 * caller is still within `limit`. Consumption is recorded even when over the limit, so hammering does not reset it.
 */
export async function consume(db: Db, bucket: string, limit: number, windowMs: number, now = new Date(), amount = 1) {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ bucket, windowStart, count: amount })
    .onConflictDoUpdate({ target: [rateLimits.bucket, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + ${amount}` } })
    .returning({ count: rateLimits.count });
  const count = row!.count;
  return { allowed: count <= limit, count, remaining: Math.max(0, limit - count) };
}
