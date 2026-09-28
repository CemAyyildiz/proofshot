/**
 * Spike B on a live network: deploy PasskeySpike, register a software Device Key, then seal N fresh
 * Capture Records (refBlock = latest block at "shutter") and record gas and latency.
 *
 *   forge build && SPIKE_PRIVATE_KEY=0x… pnpm --filter @proofshot/contracts spike:b [--samples 10]
 *
 * RPC comes from RPC_URL or the testnet default in packages/shared. Results → ../docs/spikes/spike-b-testnet.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hexToBytes, networks, sealChallenge, type CaptureRecord, type Hex } from "@proofshot/shared";
import { createPublicClient, createWalletClient, defineChain, http, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SoftwareAuthenticator, sampleRecordFields } from "./software-authenticator";

const samples = Number(process.argv[process.argv.indexOf("--samples") + 1] || 10);
const pk = process.env.SPIKE_PRIVATE_KEY as Hex | undefined;
if (!pk) throw new Error("SPIKE_PRIVATE_KEY is required (a funded testnet key)");

const net = networks.testnet;
const rpcUrl = process.env.RPC_URL ?? net.defaultRpcUrl;
const chain = defineChain({
  id: net.chainId,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const artifact = JSON.parse(readFileSync(new URL("../out/PasskeySpike.sol/PasskeySpike.json", import.meta.url), "utf8"));
const abi = artifact.abi as Abi;
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ chain, transport: http(), account });

console.log(`deployer ${account.address}, balance ${(await pub.getBalance({ address: account.address })) / 10n ** 15n} mMON`);
const deployHash = await wallet.deployContract({ abi, bytecode: artifact.bytecode.object as Hex });
const { contractAddress } = await pub.waitForTransactionReceipt({ hash: deployHash });
if (!contractAddress) throw new Error("deploy failed");
console.log(`PasskeySpike at ${contractAddress}`);

const authenticator = new SoftwareAuthenticator();
const regHash = await wallet.writeContract({
  address: contractAddress,
  abi,
  functionName: "registerDeviceKey",
  args: [authenticator.keyId, authenticator.qx, authenticator.qy],
});
await pub.waitForTransactionReceipt({ hash: regHash });

interface Sample {
  tx: Hex;
  refBlock: number;
  inclusionBlock: number;
  gasUsed: number;
  msToSigned: number;
  msToSubmitted: number;
  msToReceipt: number;
}
const results: Sample[] = [];
for (let i = 0; i < samples; i++) {
  const t0 = performance.now(); // "shutter"
  const latest = await pub.getBlock({ blockTag: "latest" });
  const record: CaptureRecord = { ...sampleRecordFields(`testnet-${Date.now()}-${i}`), refBlock: latest.number };
  const auth = authenticator.assert(hexToBytes(sealChallenge(record)));
  const t1 = performance.now(); // signed
  const hash = await wallet.writeContract({ address: contractAddress, abi, functionName: "seal", args: [authenticator.keyId, record, auth] });
  const t2 = performance.now(); // submitted
  const receipt = await pub.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  const t3 = performance.now(); // receipt observed
  if (receipt.status !== "success") throw new Error(`seal ${i} reverted: ${hash}`);
  const r: Sample = {
    tx: hash,
    refBlock: Number(record.refBlock),
    inclusionBlock: Number(receipt.blockNumber),
    gasUsed: Number(receipt.gasUsed),
    msToSigned: Math.round(t1 - t0),
    msToSubmitted: Math.round(t2 - t0),
    msToReceipt: Math.round(t3 - t0),
  };
  results.push(r);
  console.log(`#${i} gas ${r.gasUsed} window ${r.refBlock}→${r.inclusionBlock} receipt ${r.msToReceipt} ms`);
}

const sorted = (k: Exclude<keyof Sample, "tx">) => results.map((r) => r[k]).sort((a, b) => a - b);
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)]!;
const lat = sorted("msToReceipt");
const summary = {
  network: net.name,
  chainId: net.chainId,
  rpcUrl,
  contract: contractAddress,
  measuredAt: new Date().toISOString(),
  samples,
  gasUsed: { min: sorted("gasUsed")[0], max: sorted("gasUsed").at(-1) },
  msToReceipt: { p50: pct(lat, 50), p95: pct(lat, 95), max: lat.at(-1) },
  note: "Latency is submit-to-receipt from this machine, excluding on-device fingerprinting and the passkey prompt.",
  results,
};
mkdirSync(new URL("../../docs/spikes/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../docs/spikes/spike-b-testnet.json", import.meta.url), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ gasUsed: summary.gasUsed, msToReceipt: summary.msToReceipt }));
