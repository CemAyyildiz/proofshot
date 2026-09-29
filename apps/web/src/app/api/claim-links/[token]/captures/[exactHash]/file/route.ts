import { MAX_IMAGE_BYTES, receiveCaptureFile } from "@/server/capture/send";
import { getDb } from "@/server/db";
import { findSealedOnchain } from "@/server/registry";
import { bodyTooLarge } from "@/server/http";
import { getStorage } from "@/server/storage";

export async function PUT(request: Request, ctx: RouteContext<"/api/claim-links/[token]/captures/[exactHash]/file">) {
  const { token, exactHash } = await ctx.params;
  const tooLarge = bodyTooLarge(request, MAX_IMAGE_BYTES);
  if (tooLarge) return tooLarge;
  const bytes = new Uint8Array(await request.arrayBuffer());
  const result = await receiveCaptureFile(await getDb(), getStorage(), token, exactHash.toLowerCase(), bytes, findSealedOnchain);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ status: result.status });
}
