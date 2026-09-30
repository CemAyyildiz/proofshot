import { formatEther, formatGwei } from "viem";
import { env } from "@/lib/env";
import { mailConfigured } from "@/server/auth/mail";
import { RelayerNotConfigured, getRelayer, type Relayer } from "@/server/chain/relayer";
import { processSingleton } from "@/server/singleton";

/**
 * The public, unauthenticated URL would otherwise turn every request into three RPC calls, letting anyone spend the
 * app's RPC quota (and rate limits) that Seals depend on. One chain read per 15 s serves any number of callers.
 */
const STATUS_TTL_MS = 15_000;
function cachedStatus(relayer: Relayer): ReturnType<Relayer["status"]> {
  const cache = processSingleton("health-status", () => ({ at: 0, value: null as ReturnType<Relayer["status"]> | null }));
  if (!cache.value || Date.now() - cache.at > STATUS_TTL_MS) {
    cache.at = Date.now();
    cache.value = relayer.status();
    cache.value.catch(() => (cache.at = 0)); // don't serve a failure for the whole TTL
  }
  return cache.value;
}

/**
 * Liveness plus the conditions that silently break the product: a relayer running out of MON, a paused Registry, and
 * (in production) no email provider for sign-in links. Returns 503 when any holds, so a plain uptime monitor on this
 * URL alerts before people hit errors.
 */
export async function GET() {
  const { network, RELAYER_MIN_BALANCE_MON, RELAYER_MAX_FEE_GWEI } = env();
  const base = { network: network.name, chainId: network.chainId };
  let relayer;
  try {
    relayer = getRelayer();
  } catch (e) {
    if (e instanceof RelayerNotConfigured) return Response.json({ ok: true, ...base, relayer: "not-configured" });
    throw e;
  }
  try {
    const { balanceWei, paused, baseFeeWei } = await cachedStatus(relayer);
    const balance = Number(formatEther(balanceWei));
    const baseFeeGwei = Number(formatGwei(baseFeeWei));
    const problems = [
      ...(balance < RELAYER_MIN_BALANCE_MON ? ["relayer-low-balance"] : []),
      ...(paused ? ["registry-paused"] : []),
      ...(baseFeeGwei > RELAYER_MAX_FEE_GWEI ? ["gas-price-above-cap"] : []),
      ...(mailConfigured() ? [] : ["sign-in-email-not-configured"]),
    ];
    return Response.json(
      { ok: problems.length === 0, ...base, relayerBalanceMon: balance, registryPaused: paused, baseFeeGwei, problems },
      { status: problems.length ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[health] chain unreachable", e);
    return Response.json({ ok: false, ...base, problems: ["chain-unreachable"] }, { status: 503 });
  }
}
