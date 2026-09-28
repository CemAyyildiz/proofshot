import { env } from "@/lib/env";
import { getDb } from "@/server/db";
import { registryEntries } from "@/server/registry";
import { MAX_UPLOAD_BYTES, verifyImage } from "@/server/verify/verify";
import { verdictJson } from "@/server/verify/present";

/** Public Verifier (FR-8). multipart/form-data with one `file`. The image is fingerprinted, never stored. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "This image is larger than 20 MB." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image to verify." }, { status: 400 });

  const result = await verifyImage(await getDb(), env().network.chainId, registryEntries, new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ id: result.id, receiptUrl: `/v/${result.id}`, ...verdictJson(result.verdict) });
}
