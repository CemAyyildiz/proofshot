import { type Hex32, type RegistryEntry, findMatches } from "@proofshot/fingerprint";
import type { Db } from "../db/client";
import { duplicateAlerts } from "../db/schema";

export interface DuplicateSource {
  claimFileId: string;
  /** keccak256(claimFileId): Registry entries carrying it belong to this Claim File and are not duplicates. */
  claimRef: Hex32;
  /** This Carrier's pseudonymous ID, to label matches "same carrier" or "another carrier". */
  carrierId: Hex32;
  fingerprint: { exactHash: Hex32; pHash: Hex32; tiles: Hex32[]; width: number; height: number };
}

/**
 * FR-12: raises a Duplicate Alert for every Registry entry that shows the same scene but belongs to a different
 * Claim File — at this Carrier or another. Imported Records belong to no Claim File, so they always count.
 * Stores only what the Registry holds; never the other Carrier's identity, customer or image.
 */
export async function raiseDuplicateAlerts(db: Db, entries: RegistryEntry[], src: DuplicateSource) {
  const matches = findMatches(src.fingerprint, entries).filter((m) => !(m.record.kind === "sealed" && m.record.claimRef === src.claimRef));
  if (!matches.length) return [];
  return db
    .insert(duplicateAlerts)
    .values(
      matches.map((m) => ({
        claimFileId: src.claimFileId,
        sourceExactHash: src.fingerprint.exactHash,
        matchedExactHash: m.record.exactHash,
        matchedKind: m.record.kind,
        matchedAt: new Date(m.record.blockTimestamp * 1000),
        sameCarrier: m.record.carrierId === src.carrierId,
        exact: m.exact,
        distance: m.distance,
        tileMatches: m.tileMatches,
      })),
    )
    .onConflictDoNothing()
    .returning();
}

/** Plain-language strength of a match, from the Registry data alone. */
export function matchStrength(a: { exact: boolean; distance: number; tileMatches: number }) {
  if (a.exact) return "Identical file";
  if (a.distance <= 10) return "Very strong";
  if (a.distance <= 31) return "Strong";
  return `Partial (${a.tileMatches} of 16 regions)`;
}
