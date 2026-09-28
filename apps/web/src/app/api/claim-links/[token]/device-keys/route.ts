import { getRelayer } from "@/server/chain/relayer";
import { enrollDeviceKey } from "@/server/capture/enroll";
import { getDb } from "@/server/db";

export async function POST(request: Request, ctx: RouteContext<"/api/claim-links/[token]/device-keys">) {
  const { token } = await ctx.params;
  const input = await request.json().catch(() => null);
  const result = await enrollDeviceKey(await getDb(), getRelayer, token, input);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ keyId: result.keyId, status: result.status }, { status: result.status === "registered" ? 201 : 200 });
}
