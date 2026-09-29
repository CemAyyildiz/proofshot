import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { getDb } from "@/server/db";
import { pruneExpired } from "@/server/maintenance";

/** Daily cleanup, triggered by the hosting scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(await pruneExpired(await getDb()));
}
