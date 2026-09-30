import type { CaptureRecord, Hex, WebAuthnAuth } from "@proofshot/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import { keccak256, toBytes } from "viem";
import { z } from "zod";
import { isServiceUnavailable, relayerErrorKind } from "../chain/errors";
import type { Relayer } from "../chain/relayer";
import type { Db } from "../db/client";
import { captures, claimLinks, deviceKeys } from "../db/schema";
import { resolveClaimLink } from "../dal/claim-files";
import { DAY_MS, consume } from "../rate-limit";
import { SPONSOR_BUDGET_MESSAGE, consumeSponsored } from "../sponsor-budget";

export const SEALS_PER_LINK = 50;
/** Seal-context lookups per Claim Link per hour: each costs an RPC call; a real session needs a few dozen at most. */
export const CONTEXTS_PER_LINK_PER_HOUR = 300;
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
  | { ok: false; status: 400 | 404 | 409 | 410 | 429 | 502 | 503 | 504; error: string; receiptUrl?: string };

export const receiptUrlFor = (exactHash: string) => `/r/${exactHash}`;

/** Values the Capturer's device must bind into the signed record for this Claim Link. */
export async function sealContext(db: Db, relayer: () => Relayer, token: string) {
  const link = await resolveClaimLink(db, token);
  if (!link || link.state !== "active") return null;
  if (!(await consume(db, `context:${token}`, CONTEXTS_PER_LINK_PER_HOUR, 60 * 60 * 1000)).allowed) return "limited" as const;
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

/** What the public Registry says about a sealed Exact Hash; used to reconcile a Seal whose DB write was lost. */
export interface SealedOnchain {
  txHash: Hex;
  blockNumber: bigint;
  claimRef: Hex;
  keyId: Hex;
}

export interface SealOptions {
  now?: Date;
  /** Runs after a successful Seal (Duplicate Alerts). Failures are logged, never surfaced to the Capturer. */
  onSealed?: (c: SealedCapture) => Promise<unknown>;
  /** Looks up an Exact Hash in the indexed Registry. */
  findSealed?: (exactHash: Hex) => Promise<SealedOnchain | null>;
}

export async function sealCapture(db: Db, relayer: () => Relayer, token: string, input: unknown, opts: SealOptions = {}): Promise<SealResponse> {
  const now = opts.now ?? new Date();
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
  if (!(await consumeSponsored(db, link, 1, now))) return { ok: false, status: 429, error: SPONSOR_BUDGET_MESSAGE };
  // Reserve one of the link's Seals atomically; released again if the Seal fails.
  const [reserved] = await db
    .update(claimLinks)
    .set({ sealCount: sql`${claimLinks.sealCount} + 1` })
    .where(and(eq(claimLinks.token, token), lt(claimLinks.sealCount, SEALS_PER_LINK)))
    .returning({ sealCount: claimLinks.sealCount });
  if (!reserved) return { ok: false, status: 429, error: `This link has reached its limit of ${SEALS_PER_LINK} photos. Ask your insurer for a new link.` };

  const release = () => db.update(claimLinks).set({ sealCount: sql`${claimLinks.sealCount} - 1` }).where(eq(claimLinks.token, token));
  const sealed = { claimFileId: link.claimFileId, claimRef: record.claimRef, carrierId: link.carrierPseudonymousId as Hex, record: record as CaptureRecord };

  let txHash: Hex;
  let blockNumber: bigint;
  try {
    ({ txHash, blockNumber } = await relayer().seal(keyId, record as CaptureRecord, auth as WebAuthnAuth));
  } catch (err) {
    const kind = relayerErrorKind(err);
    if (kind === "already-sealed") {
      // Our earlier attempt may have sealed it and lost the DB write or the response. The Registry decides.
      const onchain = await opts.findSealed?.(record.exactHash).catch(() => null);
      if (onchain && onchain.claimRef === record.claimRef && onchain.keyId === keyId) {
        await recordCapture(db, { claimFileId: link.claimFileId, keyId, exactHash: record.exactHash, txHash: onchain.txHash, locSalt, now });
        await opts.onSealed?.(sealed).catch((e) => console.error("[seal] post-seal hook failed", e));
        return { ok: true, txHash: onchain.txHash, blockNumber: onchain.blockNumber.toString(), receiptUrl: receiptUrlFor(record.exactHash) };
      }
      await release();
      return { ok: false, status: 409, error: "This exact photo was already sealed elsewhere." };
    }
    await release();
    console.error(`[seal] failed (${kind})`, err);
    if (isServiceUnavailable(kind)) {
      return { ok: false, status: 503, error: "Sealing is paused on our side for a moment. Your photo is kept on this phone — try again in a few minutes." };
    }
    if (kind === "timeout") {
      return { ok: false, status: 504, error: "Sealing is taking longer than usual. Tap retry — if it already went through, we'll pick it up." };
    }
    return { ok: false, status: 502, error: kind === "window-expired" ? "This photo took too long to seal. Tap retry." : "This photo couldn't be sealed. Tap retry." };
  }

  // The Seal is final onchain. A failed DB write must not turn it into an error: a retry or the send step reconciles it.
  await recordCapture(db, { claimFileId: link.claimFileId, keyId, exactHash: record.exactHash, txHash, locSalt, now }).catch((err) =>
    console.error("[seal] sealed onchain but the captures row failed; will reconcile", err),
  );
  await opts.onSealed?.(sealed).catch((err) => console.error("[seal] post-seal hook failed", err));
  return { ok: true, txHash, blockNumber: blockNumber.toString(), receiptUrl: receiptUrlFor(record.exactHash) };
}

export function recordCapture(
  db: Db,
  c: { claimFileId: string; keyId: Hex; exactHash: Hex; txHash: Hex; locSalt?: Hex | null; now: Date },
) {
  return db
    .insert(captures)
    .values({ claimFileId: c.claimFileId, deviceKeyId: c.keyId, exactHash: c.exactHash, txHash: c.txHash, locSalt: c.locSalt ?? null, sealedAt: c.now })
    .onConflictDoNothing({ target: captures.exactHash });
}
