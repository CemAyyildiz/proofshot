import { type Hex, keccak256 } from "viem";

/** One relayer write, split so the retry policy can be tested without a chain. */
export interface RawSender {
  /** Prepares and signs the transaction with the next free nonce and current fees. */
  sign(): Promise<Hex>;
  /** Broadcasts a signed transaction; resolves to its hash. */
  send(raw: Hex): Promise<Hex>;
  /** Whether the node knows this transaction (pending or mined). */
  known(hash: Hex): Promise<boolean>;
}

/** Another transaction took our nonce (another instance, a lagging fallback RPC): sign again with a fresh one. */
const NONCE_TAKEN = /nonce too low|nonce has already been used|replacement transaction underpriced/i;
/** The node already has this exact signed transaction: a previous attempt reached it but its response was lost. */
const ALREADY_KNOWN = /already known|known transaction/i;

export const SEND_ATTEMPTS = 4;

/**
 * Sends a write so that it lands at most once. The transaction is signed once per nonce, so its hash is known before
 * it is broadcast. When the node says it already has the transaction, or the nonce is taken by *our own* earlier
 * broadcast whose response was lost, that transaction is the result. Re-signing a new one would put a duplicate
 * onchain: it would revert, still cost its full gas limit on Monad, and make a successful Seal look failed.
 * Only when another transaction took the nonce is a fresh one signed.
 */
export async function sendAtMostOnce(s: RawSender, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<Hex> {
  for (let attempt = 1; ; attempt++) {
    const raw = await s.sign();
    const hash = keccak256(raw);
    try {
      return await s.send(raw);
    } catch (err) {
      const msg = String(err instanceof Error ? `${err.message} ${(err as { details?: string }).details ?? ""}` : err);
      if (ALREADY_KNOWN.test(msg)) return hash;
      if (!NONCE_TAKEN.test(msg) || attempt >= SEND_ATTEMPTS) throw err;
      if (await s.known(hash).catch(() => false)) return hash;
      await sleep(250 * attempt);
    }
  }
}
