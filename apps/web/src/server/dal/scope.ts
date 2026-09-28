import "server-only";
import { getSession, requireSession } from "../auth/session";
import { getDb } from "../db";
import type { CarrierScope } from "./claim-files";

/** The signed-in Carrier User's scope. Redirects to sign-in when there is no session. */
export async function carrierScope(): Promise<CarrierScope> {
  const session = await requireSession();
  return { db: await getDb(), carrierId: session.carrierId, userId: session.userId };
}

/** For route handlers: the caller's scope, or null (respond 401) when there is no session. */
export async function apiCarrierScope(): Promise<CarrierScope | null> {
  const session = await getSession();
  return session ? { db: await getDb(), carrierId: session.carrierId, userId: session.userId } : null;
}
