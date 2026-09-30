import type { Db } from "./db/client";
import { DAY_MS, consume } from "./rate-limit";

/**
 * Sponsored writes per Carrier per day: Device Key registrations, Seals and Imported Records, the things the relayer
 * pays for. The per-link, per-key and per-visitor limits bound one Claim Link; this bounds a whole Carrier however
 * many Claim Links it has. The demo carriers are open to anyone with one tap, so their budget is small; a real
 * Carrier's is a runaway guard far above any real day of claims.
 */
export const SPONSORED_WRITES_PER_DAY = { carrier: 5_000, sandbox: 2_000, demo: 500 } as const;

export interface SponsoredCarrier {
  carrierId: string;
  isDemo: boolean;
  isSandbox: boolean;
}

export const sponsoredWriteLimit = (c: SponsoredCarrier) =>
  c.isDemo ? SPONSORED_WRITES_PER_DAY.demo : c.isSandbox ? SPONSORED_WRITES_PER_DAY.sandbox : SPONSORED_WRITES_PER_DAY.carrier;

/** Records `amount` sponsored writes for the Carrier; false when that would exceed today's budget. */
export async function consumeSponsored(db: Db, carrier: SponsoredCarrier, amount = 1, now = new Date()): Promise<boolean> {
  return (await consume(db, `sponsor:${carrier.carrierId}`, sponsoredWriteLimit(carrier), DAY_MS, now, amount)).allowed;
}

export const SPONSOR_BUDGET_MESSAGE = "Your insurer has reached today's limit for new photos. Try again tomorrow.";
