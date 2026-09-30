import type { Hex32 } from "@proofshot/fingerprint";
import { getRelayer } from "@/server/chain/relayer";
import { sealCapture } from "@/server/capture/seal";
import { getDb } from "@/server/db";
import { raiseDuplicateAlerts } from "@/server/evidence/duplicates";
import { findSealedOnchain, registryEntries } from "@/server/registry";

export async function POST(request: Request, ctx: RouteContext<"/api/claim-links/[token]/seals">) {
  const { token } = await ctx.params;
  const db = await getDb();
  const result = await sealCapture(db, getRelayer, token, await request.json().catch(() => null), {
    onSealed: async (c) =>
      raiseDuplicateAlerts(db, await registryEntries(), {
        claimFileId: c.claimFileId,
        claimRef: c.claimRef as Hex32,
        carrierId: c.carrierId as Hex32,
        fingerprint: { ...c.record, tiles: [...c.record.tiles] as Hex32[] } as never,
      }),
    findSealed: findSealedOnchain,
  });
  if (!result.ok) return Response.json({ error: result.error, receiptUrl: result.receiptUrl, limit: result.limit }, { status: result.status });
  return Response.json({ txHash: result.txHash, blockNumber: result.blockNumber, receiptUrl: result.receiptUrl }, { status: 201 });
}
