import { getRelayer } from "@/server/chain/relayer";
import { apiCarrierScope } from "@/server/dal/scope";
import { IMPORT_BATCH, importBatch } from "@/server/evidence/import";
import { MAX_UPLOAD_BYTES } from "@/server/verify/verify";

/** FR-13: one batch of an import. multipart/form-data with up to IMPORT_BATCH `files`. */
export async function POST(request: Request) {
  const scope = await apiCarrierScope();
  if (!scope) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > IMPORT_BATCH * MAX_UPLOAD_BYTES) {
    return Response.json({ error: "This batch is too large." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size <= MAX_UPLOAD_BYTES);
  const result = await importBatch(
    scope,
    getRelayer,
    await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))),
  );
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
