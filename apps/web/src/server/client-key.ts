import { createHash } from "node:crypto";

/**
 * The caller's network address as the *proxy* saw it, for rate limiting. Never the leftmost `x-forwarded-for` entry:
 * clients can send that header themselves, and proxies such as Railway's edge append the real address rather than
 * replacing it, so the first entry is attacker-chosen (one request per fake IP would bypass every limit).
 *
 * Order: `x-real-ip`, set by the edge and not client-settable (Railway, Vercel, nginx); else the **rightmost**
 * `x-forwarded-for` entry, the one added by the proxy nearest to us. Behind an extra proxy that would be that proxy's
 * address — limits become stricter, never bypassable. Hashed; the raw IP is never stored.
 */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
}

export function clientKey(headers: Headers): string {
  return createHash("sha256").update(`proofshot:${clientIp(headers)}`).digest("hex").slice(0, 32);
}
