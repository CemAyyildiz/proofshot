/** Why a relayer write failed, so callers can tell Capturers something true and actionable. */
export type RelayerErrorKind = "unfunded" | "paused" | "already-sealed" | "window-expired" | "timeout" | "other";

export function relayerErrorKind(err: unknown): RelayerErrorKind {
  const msg = String(err instanceof Error ? `${err.message} ${(err as { details?: string }).details ?? ""}` : err);
  if (/insufficient funds|exceeds the balance|gas required exceeds allowance/i.test(msg)) return "unfunded";
  if (/EnforcedPause/.test(msg)) return "paused";
  if (/AlreadySealed/.test(msg)) return "already-sealed";
  if (/SigningWindowExpired/.test(msg)) return "window-expired";
  if (/WaitForTransactionReceiptTimeout|Timed out while waiting|timed out/i.test(msg)) return "timeout";
  return "other";
}

/** The service can't write to the Registry right now (out of funds or paused): not the user's fault, not a retry-now. */
export const isServiceUnavailable = (k: RelayerErrorKind) => k === "unfunded" || k === "paused";
