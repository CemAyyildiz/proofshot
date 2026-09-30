import type { Db } from "../db/client";
import { consume } from "../rate-limit";

/** Default per-client budget; the server passes `SIGNIN_LIMIT_PER_CLIENT`. */
export const SIGNIN_PER_CLIENT_PER_HOUR = 20;
const HOUR = 60 * 60 * 1000;

/**
 * Sign-in link budget per address and per client, consumed before any account lookup so the answer reveals
 * nothing about whether the account exists. Both buckets are charged on every attempt.
 */
export async function signInAllowed(db: Db, email: string, client: string, perEmail: number, now = new Date(), perClient = SIGNIN_PER_CLIENT_PER_HOUR) {
  const [byEmail, byClient] = await Promise.all([
    consume(db, `signin:email:${email}`, perEmail, HOUR, now),
    consume(db, `signin:client:${client}`, perClient, HOUR, now),
  ]);
  return byEmail.allowed && byClient.allowed;
}
