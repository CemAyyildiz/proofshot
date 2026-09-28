import { getRelayer } from "@/server/chain/relayer";
import { sealCapture } from "@/server/capture/seal";
import { getDb } from "@/server/db";

export async function POST(request: Request, ctx: RouteContext<"/api/claim-links/[token]/seals">) {
  const { token } = await ctx.params;
  const result = await sealCapture(await getDb(), getRelayer, token, await request.json().catch(() => null));
  if (!result.ok) return Response.json({ error: result.error, receiptUrl: result.receiptUrl }, { status: result.status });
  return Response.json({ txHash: result.txHash, blockNumber: result.blockNumber, receiptUrl: result.receiptUrl }, { status: 201 });
}
