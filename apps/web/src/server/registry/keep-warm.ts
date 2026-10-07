import "server-only";
import { env } from "@/lib/env";
import { processSingleton } from "../singleton";
import { registryEntries } from "./index";

/** A few blocks behind at most (Monad: ~0.3 s per block), so one small eth_getLogs keeps up. */
const INTERVAL_MS = 3_000;
/** While the RPC or database is down: don't fill the log, but notice within a minute when it is back. */
const MAX_BACKOFF_MS = 60_000;

/**
 * Calls `sync` now and then every `intervalMs`; after a failure the wait doubles, up to `maxBackoffMs`, and returns to
 * `intervalMs` on the next success. Returns a function that stops the loop.
 */
export function repeatWithBackoff(sync: () => Promise<unknown>, intervalMs = INTERVAL_MS, maxBackoffMs = MAX_BACKOFF_MS) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wait = intervalMs;
  const tick = async () => {
    try {
      await sync();
      wait = intervalMs;
    } catch {
      wait = Math.min(wait * 2, maxBackoffMs); // the failure itself is logged where it happens
    }
    if (stopped) return;
    timer = setTimeout(tick, wait);
    timer.unref?.(); // never keeps the process alive on shutdown
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * Keeps the Registry index a few blocks behind the chain for as long as the server runs.
 *
 * Without it the index only advances when someone asks, and the public RPC serves 100 blocks of logs per call: after
 * 30 idle minutes the next visitor waited 4 s for 6,400 blocks (measured on mainnet, 2026-10-07), and after an idle
 * night it would be over a minute. With it, no request pays for catching up; after a restart the gap is the downtime.
 */
export function keepRegistryWarm() {
  processSingleton("registry-keep-warm", () => {
    if (!env().REGISTRY_ADDRESS) return null; // nothing to index yet
    return repeatWithBackoff(registryEntries);
  });
}
