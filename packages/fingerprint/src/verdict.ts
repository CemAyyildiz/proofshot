import { TILE_COUNT, type PerceptualFingerprint } from "./fingerprint";
import { type Hex32, hamming } from "./hash";

/**
 * Verdict thresholds. Starting points from addendum A2 and the Story 1.2 probe; Spike A (benchmark/) tunes
 * them against SM-2 and the SM-C1/SM-C2 counter-metrics.
 */
export interface Thresholds {
  /** Whole-image PDQ distance at or below which two images are the same scene. PDQ's customary 31/256. */
  tMatch: number;
  /** Per-tile PDQ distance above which a tile counts as changed. */
  tTile: number;
  /**
   * A record also matches when at least this many tiles are within `tTile`, even if the whole-image hash moved
   * past `tMatch`. A localized edit can move the whole-image hash a long way while leaving most tiles intact.
   */
  minTileMatches: number;
  /** Aspect-ratio difference beyond which tiles no longer align and the Alteration Check is unavailable. */
  aspectTolerance: number;
  /** Tiles of the submitted image with PDQ quality below this are too featureless to judge; ignored. */
  minTileQuality: number;
  /**
   * More changed tiles than this means the geometry changed (a same-aspect crop or zoom shifts every tile),
   * not a localized edit: the Alteration Check is unavailable rather than failed, so an honest crop is
   * never labelled Altered (SM-C1) and is still never shown as a clean result.
   */
  maxAlteredTiles: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  tMatch: 31,
  tTile: 40,
  minTileMatches: 12,
  aspectTolerance: 0.02,
  minTileQuality: 0,
  maxAlteredTiles: 8,
};

/** A Registry entry as indexed from `CaptureSealed` or `RecordImported`. */
export interface RegistryEntry {
  kind: "sealed" | "imported";
  exactHash: Hex32;
  pHash: Hex32;
  tiles: Hex32[];
  width: number;
  height: number;
  carrierId: Hex32;
  blockNumber: bigint;
  txHash: Hex32;
  /** Unix seconds of the inclusion block. */
  blockTimestamp: number;
  // Sealed only:
  keyId?: Hex32;
  claimRef?: Hex32;
  refBlock?: bigint;
  deviceTime?: bigint;
  locCommit?: Hex32;
}

export type AlterationCheck = "passed" | "failed" | "unavailable";

export type Verdict =
  | { kind: "original"; record: RegistryEntry }
  | {
      kind: "derived-copy";
      record: RegistryEntry;
      distance: number;
      alterationCheck: Exclude<AlterationCheck, "failed">;
      tileDistances?: number[];
    }
  | { kind: "altered"; record: RegistryEntry; distance: number; alterationCheck: "failed"; alteredTiles: number[]; tileDistances: number[] }
  | { kind: "no-record"; nearestDistance?: number };

export type VerdictKind = Verdict["kind"];

const aspect = (w: number, h: number) => w / h;

export function aspectCompatible(a: { width: number; height: number }, b: { width: number; height: number }, tolerance: number) {
  const ra = aspect(a.width, a.height);
  const rb = aspect(b.width, b.height);
  return Math.abs(ra - rb) / rb <= tolerance;
}

interface Candidate {
  record: RegistryEntry;
  distance: number;
  tileDistances?: number[];
  tileMatches: number;
}

function score(fp: PerceptualFingerprint, record: RegistryEntry, t: Thresholds): Candidate {
  const distance = hamming(fp.pHash, record.pHash);
  if (!aspectCompatible(fp, record, t.aspectTolerance) || record.tiles.length !== TILE_COUNT) {
    return { record, distance, tileMatches: 0 };
  }
  const tileDistances = record.tiles.map((tile, i) => hamming(fp.tiles[i]!, tile));
  return { record, distance, tileDistances, tileMatches: tileDistances.filter((d) => d <= t.tTile).length };
}

const isMatch = (c: Candidate, t: Thresholds) => c.distance <= t.tMatch || c.tileMatches >= t.minTileMatches;

/** Better match first: more aligned tiles, then smaller whole-image distance, then a sealed record over an imported one. */
function better(a: Candidate, b: Candidate) {
  if (a.tileMatches !== b.tileMatches) return a.tileMatches > b.tileMatches;
  if (a.distance !== b.distance) return a.distance < b.distance;
  return a.record.kind === "sealed" && b.record.kind !== "sealed";
}

/**
 * The single Verdict for a submitted image (PRD glossary, addendum A2):
 * 1. Exact Hash of a sealed record → Original.
 * 2. Best perceptual match, or No Record when nothing matches.
 * 3. Aspect ratio off by more than the tolerance, or most tiles shifted (a crop) → Derived Copy with the
 *    Alteration Check unavailable. A cropped copy is never shown as a clean result, nor wrongly as Altered.
 * 4. Any comparable tile beyond `tTile` → Altered with those tiles; otherwise Derived Copy.
 * Imported records never yield Original, even byte-identical ones: they carry no Device Key signature.
 */
export function computeVerdict(
  fp: PerceptualFingerprint & { exactHash: Hex32 },
  records: Iterable<RegistryEntry>,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Verdict {
  let best: Candidate | undefined;
  let nearest = Infinity;
  for (const record of records) {
    if (record.kind === "sealed" && record.exactHash === fp.exactHash) return { kind: "original", record };
    const c = score(fp, record, t);
    nearest = Math.min(nearest, c.distance);
    if (isMatch(c, t) && (!best || better(c, best))) best = c;
  }
  if (!best) return { kind: "no-record", nearestDistance: Number.isFinite(nearest) ? nearest : undefined };

  const { record, distance, tileDistances } = best;
  if (!tileDistances) return { kind: "derived-copy", record, distance, alterationCheck: "unavailable" };

  const alteredTiles = tileDistances.flatMap((d, i) => (d > t.tTile && (fp.tileQuality[i] ?? 100) >= t.minTileQuality ? [i] : []));
  if (alteredTiles.length > t.maxAlteredTiles) return { kind: "derived-copy", record, distance, alterationCheck: "unavailable", tileDistances };
  if (alteredTiles.length > 0) return { kind: "altered", record, distance, alterationCheck: "failed", alteredTiles, tileDistances };
  return { kind: "derived-copy", record, distance, alterationCheck: "passed", tileDistances };
}
