import type { Verdict } from "@proofshot/fingerprint";

/** JSON-safe Verdict for API responses (bigints as strings). */
export function verdictJson(v: Verdict) {
  const record =
    "record" in v
      ? {
          kind: v.record.kind,
          exactHash: v.record.exactHash,
          txHash: v.record.txHash,
          blockNumber: v.record.blockNumber.toString(),
          sealedAt: new Date(v.record.blockTimestamp * 1000).toISOString(),
        }
      : null;
  return {
    verdict: v.kind,
    alterationCheck: "alterationCheck" in v ? v.alterationCheck : null,
    alteredTiles: v.kind === "altered" ? v.alteredTiles : [],
    distance: "distance" in v ? v.distance : null,
    record,
  };
}
