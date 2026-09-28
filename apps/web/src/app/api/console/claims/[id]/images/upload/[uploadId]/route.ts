import { evidenceImageKey } from "@/server/dal/claim-files";
import { apiCarrierScope } from "@/server/dal/scope";
import { evidenceImageResponse } from "@/server/evidence/image-response";

export async function GET(_: Request, ctx: RouteContext<"/api/console/claims/[id]/images/upload/[uploadId]">) {
  const scope = await apiCarrierScope();
  if (!scope) return new Response("Unauthorized", { status: 401 });
  const { id, uploadId } = await ctx.params;
  return evidenceImageResponse(await evidenceImageKey(scope, id, { uploadId }));
}
