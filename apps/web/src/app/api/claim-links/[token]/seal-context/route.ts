import { getRelayer } from "@/server/chain/relayer";
import { sealContext } from "@/server/capture/seal";
import { getDb } from "@/server/db";

export async function GET(_: Request, ctx: RouteContext<"/api/claim-links/[token]/seal-context">) {
  const { token } = await ctx.params;
  const context = await sealContext(await getDb(), getRelayer, token);
  if (!context) return Response.json({ error: "This link is no longer active." }, { status: 410 });
  if (context === "limited") return Response.json({ error: "Too many photos in a short time. Wait a few minutes and retry." }, { status: 429 });
  if ("limit" in context) return Response.json({ error: context.limit, limit: true }, { status: 429 });
  if ("unavailable" in context) return Response.json({ error: context.unavailable }, { status: 503 });
  return Response.json(context, { headers: { "Cache-Control": "no-store" } });
}
