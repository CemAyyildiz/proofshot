import type { CaptureRecord, Hex, WebAuthnAuth } from "@proofshot/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import { keccak256, toBytes } from "viem";
import { z } from "zod";
import type { Relayer } from "../chain/relayer";
import type { Db } from "../db/client";
import { captures, claimLinks, deviceKeys } from "../db/schema";
import { resolveClaimLink } from "../dal/claim-files";
import { DAY_MS, consume } from "../rate-limit";

export const SEALS_PER_LINK = 50;
export const SEALS_PER_KEY_PER_DAY = 200;

/** Opaque onchain reference to a Claim File; never the Carrier's reference string. */
export const claimRefFor = (claimFileId: string) => keccak256(toBytes(claimFileId));

const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((s) => s.toLowerCase() as Hex);
const hexBytes = z.string().regex(/^0x([0-9a-fA-F]{2})*$/).transform((s) => s as Hex);
const uint = (max: bigint) =>
  z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform(BigInt).refine((v) => v <= max);

export const sealBody = z.object({
  keyId: bytes32,
  record: z.object({
    exactHash: bytes32,
    pHash: bytes32,
    tiles: z.array(bytes32).length(16),
    width: z.number().int().min(64).max(20_000),
    height: z.number().int().min(64).max(20_000),
    locCommit: bytes32,
    deviceTime: uint(2n ** 64n - 1n),
    claimRef: bytes32,
    carrierId: bytes32,
    refBlock: uint(2n ** 64n - 1n),
  }),
  auth: z.object({
    r: bytes32,
    s: bytes32,
    challengeIndex: z.number().int().nonnegative().max(10_000),
    typeIndex: z.number().int().nonnegative().max(10_000),
    authenticatorData: hexBytes,
    clientDataJSON: z.string().max(4_000),
  }),
  /** Location Commitment salt, kept by the Carrier only; absent when no location was committed. */
  locSalt: bytes32.optional(),
});

export type SealResponse =
  | { ok: true; txHash: Hex; blockNumber: string; receiptUrl: string }
  | { ok: false; status: 400 | 404 | 409 | 410 | 429 | 502; error: string; receiptUrl?: string };

export const receiptUrlFor = (exactHash: string) => `/r/${exactHash}`;

/** Values the Capturer's device must bind into the signed record for this Claim Link. */
export async function sealContext(db: Db, relayer: () => Relayer, token: string) {
  const link = await resolveClaimLink(db, token);
  if (!link || link.state !== "active") return null;
  const block = await relayer().latestBlock();
  return {
    claimRef: claimRefFor(link.claimFileId),
    carrierId: link.carrierPseudonymousId as Hex,
    refBlock: block.number.toString(),
    sealsRemaining: Math.max(0, SEALS_PER_LINK - link.sealCount),
  };
}

export interface SealedCapture {
  claimFileId: string;
  claimRef: Hex;
  carrierId: Hex;
  record: CaptureRecord;
}

export async function sealCapture(
  db: Db,
  relayer: () => Relayer,
  token: string,
  input: unknown,
  now = new Date(),
  /** Runs after a successful Seal (Duplicate Alerts). Failures are logged, never surfaced to the Capturer. */
  onSealed?: (c: SealedCapture) => Promise<unknown>,
): Promise<SealResponse> {
  const parsed = sealBody.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: "Invalid request." };
  const { keyId, record, auth, locSalt } = parsed.data;

  const link = await resolveClaimLink(db, token, now);
  if (!link) return { ok: false, status: 404, error: "This link is not valid." };
  if (link.state !== "active") return { ok: false, status: 410, error: "This link is no longer active." };
  // The relayer attests Carrier and Claim File onchain, so they must come from the link, not the client.
  if (record.claimRef !== claimRefFor(link.claimFileId) || record.carrierId !== link.carrierPseudonymousId.toLowerCase()) {
    return { ok: false, status: 400, error: "Invalid request." };
  }
  const [key] = await db.select({ keyId: deviceKeys.keyId }).from(deviceKeys).where(eq(deviceKeys.keyId, keyId));
  if (!key) return { ok: false, status: 400, error: "This device isn't set up yet. Reload the page to set it up." };

  const [existing] = await db
    .select({ claimFileId: captures.claimFileId })
    .from(captures)
    .where(eq(captures.exactHash, record.exactHash));
  if (existing) {
    // Only this Claim File's own photo counts as "already sealed here"; the same bytes in another claim are a reuse.
    return existing.claimFileId === link.claimFileId
      ? { ok: false, status: 409, error: "This photo is already sealed.", receiptUrl: receiptUrlFor(record.exactHash) }
      : { ok: false, status: 409, error: "This exact photo was already sealed for a different claim." };
  }

  if (!(await consume(db, `seal:key:${keyId}`, SEALS_PER_KEY_PER_DAY, DAY_MS, now)).allowed) {
    return { ok: false, status: 429, error: "You've sealed the maximum number of photos for today on this device." };
  }
  // Reserve one of the link's Seals atomically; released again if the Seal fails.
  const [reserved] = await db
    .update(claimLinks)
    .set({ sealCount: sql`${claimLinks.sealCount} + 1` })
    .where(and(eq(claimLinks.token, token), lt(claimLinks.sealCount, SEALS_PER_LINK)))
    .returning({ sealCount: claimLinks.sealCount });
  if (!reserved) return { ok: false, status: 429, error: `This link has reached its limit of ${SEALS_PER_LINK} photos. Ask your insurer for a new link.` };

  try {
    const { txHash, blockNumber } = await relayer().seal(keyId, record as CaptureRecord, auth as WebAuthnAuth);
    await db.insert(captures).values({
      claimFileId: link.claimFileId,
      deviceKeyId: keyId,
      exactHash: record.exactHash,
      txHash,
      locSalt: locSalt ?? null,
      sealedAt: now,
    });
    if (onSealed) {
      await onSealed({
        claimFileId: link.claimFileId,
        claimRef: record.claimRef,
        carrierId: link.carrierPseudonymousId as Hex,
        record: record as CaptureRecord,
      }).catch((err) => console.error("[seal] post-seal hook failed", err));
    }
    return { ok: true, txHash, blockNumber: blockNumber.toString(), receiptUrl: receiptUrlFor(record.exactHash) };
  } catch (err) {
    await db.update(claimLinks).set({ sealCount: sql`${claimLinks.sealCount} - 1` }).where(eq(claimLinks.token, token));
    const msg = String(err);
    if (msg.includes("AlreadySealed")) {
      // Sealed onchain but not by this Claim File (it would have a captures row): never present it as ours.
      return { ok: false, status: 409, error: "This exact photo was already sealed elsewhere." };
    }
    console.error("[seal] failed", err);
    const expired = msg.includes("SigningWindowExpired");
    return { ok: false, status: 502, error: expired ? "This photo took too long to seal. Tap retry." : "This photo couldn't be sealed. Tap retry." };
  }
}
