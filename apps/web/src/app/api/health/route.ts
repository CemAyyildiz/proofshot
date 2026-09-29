import { formatEther } from "viem";
import { env } from "@/lib/env";
import { RelayerNotConfigured, getRelayer } from "@/server/chain/relayer";

/**
 * Liveness plus the two conditions that silently break sealing: a relayer running out of MON and a paused Registry.
 * Returns 503 when either holds, so a plain uptime monitor on this URL alerts before Capturers hit errors.
 */
export async function GET() {
  const { network, RELAYER_MIN_BALANCE_MON } = env();
  const base = { network: network.name, chainId: network.chainId };
  let relayer;
  try {
    relayer = getRelayer();
  } catch (e) {
    if (e instanceof RelayerNotConfigured) return Response.json({ ok: true, ...base, relayer: "not-configured" });
    throw e;
  }
  try {
    const { balanceWei, paused } = await relayer.status();
    const balance = Number(formatEther(balanceWei));
    const problems = [...(balance < RELAYER_MIN_BALANCE_MON ? ["relayer-low-balance"] : []), ...(paused ? ["registry-paused"] : [])];
    return Response.json(
      { ok: problems.length === 0, ...base, relayerBalanceMon: balance, registryPaused: paused, problems },
      { status: problems.length ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[health] chain unreachable", e);
    return Response.json({ ok: false, ...base, problems: ["chain-unreachable"] }, { status: 503 });
  }
}
