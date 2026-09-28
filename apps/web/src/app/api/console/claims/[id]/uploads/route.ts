import { env } from "@/lib/env";
import { apiCarrierScope } from "@/server/dal/scope";
import { uploadIntoClaimFile } from "@/server/evidence/upload";
import { registryEntries } from "@/server/registry";
import { getStorage } from "@/server/storage";
import { MAX_UPLOAD_BYTES } from "@/server/verify/verify";

/** FR-14: verify an image received outside Proofshot inside a Claim File. multipart/form-data with one `file`. */
export async function POST(request: Request, ctx: RouteContext<"/api/console/claims/[id]/uploads">) {
  const scope = await apiCarrierScope();
  if (!scope) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "This image is larger than 20 MB." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image to verify." }, { status: 400 });
  const { id } = await ctx.params;
  const result = await uploadIntoClaimFile(scope, getStorage(), registryEntries, env().network.chainId, id, new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result, { status: 201 });
}
