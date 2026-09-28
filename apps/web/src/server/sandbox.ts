import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { carriers } from "./db/schema";
import { createClaimFile } from "./dal/claim-files";
import { DAY_MS, consume } from "./rate-limit";

/** New sandbox Claim Files per visitor (hashed IP) per day. Seals inside them keep the FR-7 limits. */
export const SANDBOX_FILES_PER_DAY = 5;

export type SandboxResult = { ok: true; token: string } | { ok: false; error: string };

/**
 * FR-18: a throwaway Claim File in the public sandbox Carrier. Its Captures are sealed on the real Registry but
 * carry the sandbox Carrier ID, so they are distinguishable and excluded from SM-3.
 */
export async function startSandbox(db: Db, visitorKey: string, now = new Date()): Promise<SandboxResult> {
  const [sandbox] = await db.select().from(carriers).where(eq(carriers.slug, "sandbox"));
  if (!sandbox) return { ok: false, error: "The demo isn't available right now." };
  const bucket = `sandbox:${createHash("sha256").update(visitorKey).digest("hex").slice(0, 32)}`;
  if (!(await consume(db, bucket, SANDBOX_FILES_PER_DAY, DAY_MS, now)).allowed) {
    return { ok: false, error: "You've started the demo several times today. Come back tomorrow, or keep using your last demo link." };
  }
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const file = await createClaimFile({ db, carrierId: sandbox.id }, `DEMO ${stamp}`, now);
  return { ok: true, token: file.link.token };
}
