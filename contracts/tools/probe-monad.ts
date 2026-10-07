/**
 * Keyless Spike B probe: runs OpenZeppelin WebAuthn verification of the committed fixture on live Monad networks via
 * eth_call of WebAuthnProbe's creation code (nothing is deployed, no key or funds needed).
 *
 *   forge build && pnpm --filter @proofshot/contracts probe
 */
import { readFileSync, writeFileSync } from "node:fs";
import { networks } from "@proofshot/shared";
import { createPublicClient, decodeErrorResult, encodeDeployData, http, type Abi, type Hex } from "viem";

const artifact = JSON.parse(readFileSync(new URL("../out/WebAuthnProbe.sol/WebAuthnProbe.json", import.meta.url), "utf8"));
const abi = artifact.abi as Abi;
const fx = JSON.parse(readFileSync(new URL("../test/fixtures/webauthn-software.json", import.meta.url), "utf8"));
const auth = { ...fx.auth, challengeIndex: BigInt(fx.auth.challengeIndex), typeIndex: BigInt(fx.auth.typeIndex) };
const tampered = { ...auth, s: `0x${(BigInt(auth.s) ^ 1n).toString(16).padStart(64, "0")}` };

const results: Record<string, unknown> = { measuredAt: new Date().toISOString(), fixture: fx.source };
for (const net of [networks.testnet, networks.mainnet]) {
  const client = createPublicClient({ transport: http(net.defaultRpcUrl) });
  const run = async (a: typeof auth) => {
    const data = encodeDeployData({ abi, bytecode: artifact.bytecode.object as Hex, args: [fx.challenge, a, fx.qx, fx.qy] });
    try {
      await client.call({ data });
      throw new Error("probe did not revert");
    } catch (e) {
      const raw = (e as { walk?: (fn: (x: unknown) => boolean) => { data?: Hex } }).walk?.((x) => typeof (x as { data?: unknown }).data === "string")?.data;
      if (!raw) throw e;
      const { args } = decodeErrorResult({ abi, data: raw });
      const [valid, gasUsed, precompileAccepted] = args as [boolean, bigint, boolean];
      return { valid, gasUsed: Number(gasUsed), precompileAccepted };
    }
  };
  results[net.name] = {
    chainId: await client.getChainId(),
    block: Number(await client.getBlockNumber()),
    validAssertion: await run(auth),
    tamperedSignature: await run(tampered),
  };
  console.log(net.name, JSON.stringify(results[net.name]));
}
if (!process.argv.includes("--no-write")) {
  writeFileSync(new URL("../../docs/monad-p256-probe.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
}

// Canary: fail loudly if either network stops verifying passkeys natively or starts accepting a tampered signature.
const broken = [networks.testnet, networks.mainnet].filter((n) => {
  const r = results[n.name] as { validAssertion: { valid: boolean; precompileAccepted: boolean }; tamperedSignature: { valid: boolean } };
  return !r.validAssertion.valid || !r.validAssertion.precompileAccepted || r.tamperedSignature.valid;
});
if (broken.length) {
  console.error(`PROBE FAILED on ${broken.map((n) => n.name).join(", ")}`);
  process.exitCode = 1;
}
