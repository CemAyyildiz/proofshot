import { base64UrlDecode, spkiToXY, type Hex } from "@proofshot/shared";
import { eq } from "drizzle-orm";
import { keccak256 } from "viem";
import { z } from "zod";
import { isServiceUnavailable, relayerErrorKind } from "../chain/errors";
import type { Relayer } from "../chain/relayer";
import type { Db } from "../db/client";
import { deviceKeys } from "../db/schema";
import { resolveClaimLink } from "../dal/claim-files";
import { DAY_MS, consume } from "../rate-limit";

/** Each registration costs sponsored gas; bound it per Claim Link. */
export const ENROLLMENTS_PER_LINK_PER_DAY = 10;

export const enrollBody = z.object({
  credentialId: z.string().regex(/^[A-Za-z0-9_-]{16,1400}$/),
  publicKey: z.string().regex(/^[A-Za-z0-9_-]{100,200}$/), // SPKI DER, base64url
});

export type EnrollResult =
  | { ok: true; keyId: Hex; status: "registered" | "existing" }
  | { ok: false; status: 400 | 404 | 410 | 429 | 503; error: string };

export const keyIdFor = (credentialId: string) => keccak256(base64UrlDecode(credentialId));

export async function enrollDeviceKey(db: Db, relayer: () => Relayer, token: string, input: unknown): Promise<EnrollResult> {
  const body = enrollBody.safeParse(input);
  if (!body.success) return { ok: false, status: 400, error: "Invalid request." };

  const link = await resolveClaimLink(db, token);
  if (!link) return { ok: false, status: 404, error: "This link is not valid." };
  if (link.state !== "active") return { ok: false, status: 410, error: "This link is no longer active." };

  let point: { qx: Hex; qy: Hex };
  try {
    point = spkiToXY(base64UrlDecode(body.data.publicKey));
  } catch {
    return { ok: false, status: 400, error: "Unsupported passkey type." };
  }
  const keyId = keyIdFor(body.data.credentialId);

  const [existing] = await db.select().from(deviceKeys).where(eq(deviceKeys.keyId, keyId));
  if (existing) {
    // Keys are immutable onchain; a different public key under the same credential ID is a forgery attempt.
    if (existing.qx !== point.qx || existing.qy !== point.qy) return { ok: false, status: 400, error: "Invalid request." };
    return { ok: true, keyId, status: "existing" };
  }

  if (!(await consume(db, `enroll:${token}`, ENROLLMENTS_PER_LINK_PER_DAY, DAY_MS)).allowed) {
    return { ok: false, status: 429, error: "Too many devices were set up with this link today. Try again tomorrow." };
  }

  await db.insert(deviceKeys).values({ keyId, credentialId: body.data.credentialId, ...point });
  try {
    await relayer().registerDeviceKey(keyId, point.qx, point.qy);
  } catch (err) {
    const kind = relayerErrorKind(err);
    // An earlier attempt landed but its response was lost (timeout, restart, a retried send). The same key is
    // already registered: that is success. Without this, every retry would revert and the passkey could never
    // be used.
    if (kind === "key-exists" && (await sameKeyOnchain(relayer(), keyId, point))) return { ok: true, keyId, status: "registered" };
    await db.delete(deviceKeys).where(eq(deviceKeys.keyId, keyId));
    console.error(`[enroll] registerDeviceKey failed (${kind})`, err);
    return {
      ok: false,
      status: 503,
      error: isServiceUnavailable(kind)
        ? "Setup is paused on our side for a moment. Try again in a few minutes."
        : "We couldn't finish setting up this device. Try again in a moment.",
    };
  }
  return { ok: true, keyId, status: "registered" };
}

async function sameKeyOnchain(relayer: Relayer, keyId: Hex, point: { qx: Hex; qy: Hex }): Promise<boolean> {
  const onchain = await relayer.deviceKey(keyId).catch(() => null);
  return !!onchain && onchain.revokedAtBlock === 0n && onchain.qx.toLowerCase() === point.qx.toLowerCase() && onchain.qy.toLowerCase() === point.qy.toLowerCase();
}
