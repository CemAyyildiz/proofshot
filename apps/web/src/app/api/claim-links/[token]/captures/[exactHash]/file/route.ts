import { MAX_IMAGE_BYTES, receiveCaptureFile } from "@/server/capture/send";
import { getDb } from "@/server/db";
import { getStorage } from "@/server/storage";

export async function PUT(request: Request, ctx: RouteContext<"/api/claim-links/[token]/captures/[exactHash]/file">) {
  const { token, exactHash } = await ctx.params;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return Response.json({ error: "This photo is too large." }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  const result = await receiveCaptureFile(await getDb(), getStorage(), token, exactHash.toLowerCase(), bytes);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ status: result.status });
}
