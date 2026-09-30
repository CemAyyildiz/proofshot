/**
 * Local chain for development and e2e: Anvil on the Osaka hardfork (P256 precompile present), state persisted
 * in apps/web/.data/anvil.json, Registry deployed once, and apps/web/.env.local pointed at it.
 *
 *   pnpm dev:chain            (from the repo root; Ctrl-C saves state)
 *
 * Env: ANVIL_PORT (8545), ANVIL_STATE=none for an ephemeral chain, ENV_OUT=none to skip writing .env.local.
 * On a fresh chain the Registry lands at 0x5FbDB2315678afecb367f032d93F642f64180aa3 (deployer nonce 0).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, sha256, toBytes, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const PORT = Number(process.env.ANVIL_PORT ?? 8545);
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's prefunded dev keys: #0 deploys and administers, #1 is the relayer.
const ADMIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const RELAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const RP_IDS = (process.env.RP_IDS ?? "localhost").split(",");

const webDir = new URL("../../apps/web/", import.meta.url);
const dataDir = new URL(".data/", webDir);
const statePath = process.env.ANVIL_STATE === "none" ? null : new URL("anvil.json", dataDir).pathname;
const envPath = process.env.ENV_OUT === "none" ? null : new URL(".env.local", webDir).pathname;
mkdirSync(dataDir, { recursive: true });

// Block gas limit = the Osaka per-tx cap (EIP-7825, 2^24); otherwise eth_estimateGas probes with 30M and fails.
const anvil = spawn("anvil", ["--hardfork", "osaka", "--gas-limit", "16777216", "--port", String(PORT), ...(statePath ? ["--state", statePath] : []), "--silent"], {
  stdio: "inherit",
});
const stop = () => anvil.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
anvil.on("exit", (code) => process.exit(code ?? 0));
process.on("uncaughtException", (e) => {
  console.error(e);
  stop();
});

const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
for (let i = 0; ; i++) {
  try {
    await pub.getChainId();
    break;
  } catch {
    if (i > 50) throw new Error("anvil did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}

function readEnv(): Map<string, string> {
  const m = new Map<string, string>();
  if (!envPath || !existsSync(envPath)) return m;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) m.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  return m;
}

const env = readEnv();
let registry = env.get("REGISTRY_ADDRESS") as Hex | undefined;
const deployed = registry && (await pub.getCode({ address: registry })) && env.get("PROOFSHOT_NETWORK") === "local";

if (!deployed) {
  const artifact = JSON.parse(readFileSync(new URL("../out/Registry.sol/Registry.json", import.meta.url), "utf8"));
  const admin = privateKeyToAccount(ADMIN_KEY);
  const relayer = privateKeyToAccount(RELAYER_KEY);
  const wallet = createWalletClient({ chain: foundry, transport: http(RPC), account: admin });
  const hash = await wallet.deployContract({
    abi: artifact.abi as Abi,
    bytecode: artifact.bytecode.object as Hex,
    args: [admin.address, relayer.address, RP_IDS.map((id) => sha256(toBytes(id)))],
  });
  registry = (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
  env.set("PROOFSHOT_NETWORK", "local");
  env.set("RPC_URL", RPC);
  env.set("REGISTRY_ADDRESS", registry);
  env.set("RELAYER_PRIVATE_KEY", RELAYER_KEY);
  // Local only: one tap into the seeded demo carriers' Console (kept if the developer set it explicitly).
  if (!env.has("DEMO_ACCESS")) env.set("DEMO_ACCESS", "1");
  if (envPath) writeFileSync(envPath, [...env].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  console.log(`Registry deployed at ${registry}${envPath ? `; wrote ${envPath}` : ""}`);
} else {
  console.log(`Registry already at ${registry}`);
}
console.log(`local chain ready on ${RPC} (Ctrl-C to stop and save state)`);
