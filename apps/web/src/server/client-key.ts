import { createHash } from "node:crypto";

/**
 * A stable, non-reversible key for the caller's network address, for rate limiting. Vercel and most proxies put the
 * client first in `x-forwarded-for`. The raw IP is never stored.
 */
export function clientKey(headers: Headers): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`proofshot:${ip}`).digest("hex").slice(0, 32);
}
