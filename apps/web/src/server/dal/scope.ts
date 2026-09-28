import "server-only";
import { requireSession } from "../auth/session";
import { getDb } from "../db";
import type { CarrierScope } from "./claim-files";

/** The signed-in Carrier User's scope. Redirects to sign-in when there is no session. */
export async function carrierScope(): Promise<CarrierScope> {
  const session = await requireSession();
  return { db: await getDb(), carrierId: session.carrierId, userId: session.userId };
}
