/**
 * Fee policy for relayer transactions. Monad charges `min(base + priority, maxFee) × gasLimit`; the relayer pays for
 * every Seal, so a fee spike must not silently multiply that cost, and a transaction must never be sent with a max fee
 * below the current base fee — it would sit pending and block every later nonce of the relayer.
 */
export class FeeTooHigh extends Error {
  override name = "FeeTooHigh";
}

export interface Fees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** Caps the estimated fees at `capWei`; throws FeeTooHigh when the base fee alone is already above the cap. */
export function capFees(estimate: Fees, baseFeePerGas: bigint, capWei: bigint): Fees {
  if (baseFeePerGas > capWei) {
    throw new FeeTooHigh(`base fee ${baseFeePerGas} wei exceeds the relayer cap of ${capWei} wei`);
  }
  const maxFeePerGas = estimate.maxFeePerGas < capWei ? estimate.maxFeePerGas : capWei;
  const headroom = maxFeePerGas - baseFeePerGas;
  const maxPriorityFeePerGas = estimate.maxPriorityFeePerGas < headroom ? estimate.maxPriorityFeePerGas : headroom;
  return { maxFeePerGas, maxPriorityFeePerGas };
}
