import type { Db } from "../db/client";
import { consume } from "../rate-limit";

export const SIGNIN_PER_CLIENT_PER_HOUR = 20;
const HOUR = 60 * 60 * 1000;

/**
 * Sign-in link budget per address and per client, consumed before any account lookup so the answer reveals
 * nothing about whether the account exists. Both buckets are charged on every attempt.
 */
export async function signInAllowed(db: Db, email: string, client: string, perEmail: number, now = new Date()) {
  const [byEmail, byClient] = await Promise.all([
    consume(db, `signin:email:${email}`, perEmail, HOUR, now),
    consume(db, `signin:client:${client}`, SIGNIN_PER_CLIENT_PER_HOUR, HOUR, now),
  ]);
  return byEmail.allowed && byClient.allowed;
}
