import { env } from "@/lib/env";

export function GET() {
  const { network } = env();
  return Response.json({ ok: true, network: network.name, chainId: network.chainId });
}
