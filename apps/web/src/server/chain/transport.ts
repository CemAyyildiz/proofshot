import "server-only";
import { fallback, http, type Transport } from "viem";
import { env } from "@/lib/env";

/** Primary RPC with automatic failover to RPC_URL_SECONDARY when set (NFR-4: the demo survives an RPC outage). */
export function rpcTransport(): Transport {
  const { rpcUrl, RPC_URL_SECONDARY } = env();
  const primary = http(rpcUrl, { retryCount: 2 });
  return RPC_URL_SECONDARY ? fallback([primary, http(RPC_URL_SECONDARY, { retryCount: 2 })]) : primary;
}
