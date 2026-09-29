import type { Hex32 } from "@proofshot/fingerprint";
import { eq } from "drizzle-orm";
import { isServiceUnavailable, relayerErrorKind } from "../chain/errors";
import type { ImportRecord, Relayer } from "../chain/relayer";
import { carriers } from "../db/schema";
import type { CarrierScope } from "../dal/claim-files";
import { fingerprintFile } from "../fingerprint";
import { DAY_MS, consume } from "../rate-limit";

/** Images per request; one Registry transaction per batch. */
export const IMPORT_BATCH = 10;
/** FR-13: up to 500 images per import; daily ceiling on sponsored import fees per Carrier. */
export const IMPORTS_PER_CARRIER_PER_DAY = 2_000;

export type ImportItemResult = { name: string; status: "imported" | "unreadable"; exactHash?: string };
export type ImportBatchResult =
  | { ok: true; items: ImportItemResult[]; txHash: string | null }
  | { ok: false; status: 400 | 429 | 502 | 503; error: string };

/**
 * Fingerprints each image (the bytes are discarded, never stored) and writes the fingerprints to the Registry as
 * Imported Records under this Carrier's pseudonymous ID. The contract skips hashes already imported or sealed.
 */
export async function importBatch(
  scope: CarrierScope,
  relayer: () => Relayer,
  files: { name: string; bytes: Uint8Array }[],
  now = new Date(),
): Promise<ImportBatchResult> {
  if (files.length === 0 || files.length > IMPORT_BATCH) return { ok: false, status: 400, error: `Send 1–${IMPORT_BATCH} images per batch.` };
  if (!(await consume(scope.db, `import:${scope.carrierId}`, IMPORTS_PER_CARRIER_PER_DAY, DAY_MS, now)).allowed) {
    return { ok: false, status: 429, error: "Your carrier has reached today's import limit. Continue tomorrow." };
  }

  const items: ImportItemResult[] = [];
  const records: ImportRecord[] = [];
  for (const f of files) {
    try {
      const fp = await fingerprintFile(f.bytes);
      records.push({ exactHash: fp.exactHash, pHash: fp.pHash, tiles: fp.tiles, width: fp.width, height: fp.height });
      items.push({ name: f.name, status: "imported", exactHash: fp.exactHash });
    } catch {
      items.push({ name: f.name, status: "unreadable" });
    }
  }
  if (!records.length) return { ok: true, items, txHash: null };

  const [carrier] = await scope.db.select({ pid: carriers.pseudonymousId }).from(carriers).where(eq(carriers.id, scope.carrierId));
  try {
    const { txHash } = await relayer().importRecords(carrier!.pid as Hex32, records);
    return { ok: true, items, txHash };
  } catch (err) {
    const kind = relayerErrorKind(err);
    console.error(`[import] importRecords failed (${kind})`, err);
    if (isServiceUnavailable(kind)) return { ok: false, status: 503, error: "Imports are paused on our side for a moment. Try again later." };
    return { ok: false, status: 502, error: "This batch couldn't be recorded. Retry it — already imported photos are skipped." };
  }
}
