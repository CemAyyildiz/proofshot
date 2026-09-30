import { formatEther, formatGwei } from "viem";
import { env } from "@/lib/env";
import { mailConfigured } from "@/server/auth/mail";
import { RelayerNotConfigured, getRelayer } from "@/server/chain/relayer";

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
    const { balanceWei, paused, baseFeeWei } = await relayer.status();
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
