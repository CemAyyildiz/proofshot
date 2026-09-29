import { env } from "@/lib/env";
import { clientKey } from "@/server/client-key";
import { getDb } from "@/server/db";
import { bodyTooLarge, withRegistry } from "@/server/http";
import { consume } from "@/server/rate-limit";
import { registryEntries } from "@/server/registry";
import { MAX_UPLOAD_BYTES, VERIFICATIONS_PER_WINDOW, VERIFICATION_WINDOW_MS, verifyImage } from "@/server/verify/verify";
import { verdictJson } from "@/server/verify/present";

/** Public Verifier (FR-8). multipart/form-data with one `file`. The image is fingerprinted, never stored. */
export async function POST(request: Request) {
  const tooLarge = bodyTooLarge(request, MAX_UPLOAD_BYTES + 64 * 1024);
  if (tooLarge) return tooLarge;
  const db = await getDb();
  if (!(await consume(db, `verify:${clientKey(request.headers)}`, VERIFICATIONS_PER_WINDOW, VERIFICATION_WINDOW_MS)).allowed) {
    return Response.json({ error: "You've checked a lot of images in a short time. Wait a few minutes and try again." }, { status: 429 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image to verify." }, { status: 400 });

  return withRegistry(async () => {
    const result = await verifyImage(db, env().network.chainId, registryEntries, new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ id: result.id, receiptUrl: `/v/${result.id}`, ...verdictJson(result.verdict) });
  });
}
