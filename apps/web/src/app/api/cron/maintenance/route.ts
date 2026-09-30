import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { getDb } from "@/server/db";
import { pruneDemoData, pruneExpired } from "@/server/maintenance";
import { getStorage } from "@/server/storage";

/** Daily cleanup, triggered by the hosting scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Not found", { status: 404 });
  }
  const db = await getDb();
  return Response.json({ ...(await pruneExpired(db)), ...(await pruneDemoData(db, getStorage())) });
}
