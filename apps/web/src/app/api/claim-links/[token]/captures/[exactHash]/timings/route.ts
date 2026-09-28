import { recordTimings } from "@/server/capture/send";
import { getDb } from "@/server/db";

export async function POST(request: Request, ctx: RouteContext<"/api/claim-links/[token]/captures/[exactHash]/timings">) {
  const { token, exactHash } = await ctx.params;
  const ok = await recordTimings(await getDb(), token, exactHash.toLowerCase(), await request.json().catch(() => null));
  return new Response(null, { status: ok ? 204 : 404 });
}
