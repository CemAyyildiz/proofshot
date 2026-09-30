import { MAX_SIGNING_LAG_BLOCKS } from "@proofshot/shared";
import type { Relayer } from "./relayer";

type Status = Awaited<ReturnType<Relayer["status"]>>;

/** How long a relayer status read is reused. Health checks and every Seal's pre-check share it. */
export const STATUS_TTL_MS = 15_000;
const cache = new WeakMap<object, { at: number; value: Promise<Status> }>();

/** The relayer's status, read from the chain at most once per TTL per relayer; a failed read is not reused. */
export function cachedStatus(relayer: Relayer, now = Date.now()): Promise<Status> {
  const hit = cache.get(relayer);
  if (hit && now - hit.at <= STATUS_TTL_MS) return hit.value;
  const value = relayer.status();
  cache.set(relayer, { at: now, value });
  value.catch(() => cache.delete(relayer));
  return value;
}

/** Gas a Seal transaction uses (≈ 100k, measured in e2e), with headroom: the balance must cover at least this much. */
const SEAL_GAS_WITH_HEADROOM = 150_000n;

/**
 * Why no Seal can land right now, from the chain's side, or null. Checked before the Capturer is asked for Face ID,
 * so a paused Registry, an empty relayer or a fee spike doesn't cost them a biometric prompt for nothing.
 */
export function sealingBlocked(s: Status, maxFeeWei: bigint): "paused" | "unfunded" | "fee-too-high" | null {
  if (s.paused) return "paused";
  if (s.baseFeeWei > maxFeeWei) return "fee-too-high";
  if (s.balanceWei < SEAL_GAS_WITH_HEADROOM * (s.baseFeeWei > 0n ? s.baseFeeWei : 1n)) return "unfunded";
  return null;
}

/**
 * Blocks left in the Signing Window below which the relayer doesn't send (~3 s at Monad's ~300 ms blocks): a Seal
 * included after the window reverts, and Monad still charges its full gas limit.
 */
export const SEND_MARGIN_BLOCKS = 10;

/** Throws (as the Registry would, but before anything is sent) when the record's window is about to close. */
export function assertWindowOpen(refBlock: bigint, head: bigint) {
  if (head - refBlock > BigInt(MAX_SIGNING_LAG_BLOCKS - SEND_MARGIN_BLOCKS)) {
    throw new Error(`SigningWindowExpired: refBlock ${refBlock}, head ${head}; not sent`);
  }
}
