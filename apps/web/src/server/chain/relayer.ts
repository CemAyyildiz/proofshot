import "server-only";
import { type CaptureRecord, type Hex, type WebAuthnAuth, registryAbi } from "@proofshot/shared";
import { createPublicClient, createWalletClient, defineChain, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "@/lib/env";
import { invalidateRegistry } from "../registry";
import { processSingleton } from "../singleton";
import { rpcTransport } from "./transport";

export interface SealResult {
  txHash: Hex;
  blockNumber: bigint;
}

/** Onchain side effects, behind an interface so routes can be tested without a chain. */
export interface Relayer {
  latestBlock(): Promise<{ number: bigint; hash: Hex }>;
  /** Submits and returns without waiting: later relayer txs are nonce-ordered after it. */
  registerDeviceKey(keyId: Hex, qx: Hex, qy: Hex): Promise<Hex>;
  /** The Device Key as the Registry holds it (all zero if unknown). */
  deviceKey(keyId: Hex): Promise<{ qx: Hex; qy: Hex; revokedAtBlock: bigint }>;
  seal(keyId: Hex, record: CaptureRecord, auth: WebAuthnAuth): Promise<SealResult>;
  importRecords(carrierId: Hex, records: ImportRecord[]): Promise<SealResult>;
  /** Relayer balance (wei) and whether the Registry is paused, for health checks. */
  status(): Promise<{ balanceWei: bigint; paused: boolean }>;
}

/** Mirrors `Registry.ImportRecord`. */
export interface ImportRecord {
  exactHash: Hex;
  pHash: Hex;
  tiles: Hex[];
  width: number;
  height: number;
}

export class RelayerNotConfigured extends Error {
  override name = "RelayerNotConfigured";
}

const NONCE_ERRORS = /nonce too low|nonce has already been used|replacement transaction underpriced|already known/i;

function createViemRelayer(): Relayer {
  const e = env();
  if (!e.RELAYER_PRIVATE_KEY || !e.REGISTRY_ADDRESS) throw new RelayerNotConfigured("RELAYER_PRIVATE_KEY and REGISTRY_ADDRESS are required");
  const chain = defineChain({
    id: e.network.chainId,
    name: `Monad ${e.network.name}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [e.rpcUrl] } },
  });
  const transport = rpcTransport();
  const pub = createPublicClient({ chain, transport }) as PublicClient;
  const account = privateKeyToAccount(e.RELAYER_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ chain, transport, account });
  const address = e.REGISTRY_ADDRESS as Hex;

  // Serialise submissions from this process so nonces are handed out in order; retry, with a short backoff, if
  // another instance (e.g. during a zero-downtime deploy) or a lagging fallback RPC raced us to a nonce.
  let queue: Promise<unknown> = Promise.resolve();
  const submit = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn();
        } catch (err) {
          if (attempt < 3 && NONCE_ERRORS.test(String(err))) {
            await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    async status() {
      const [balanceWei, paused] = await Promise.all([
        pub.getBalance({ address: account.address }),
        pub.readContract({ address, abi: registryAbi, functionName: "paused" }),
      ]);
      return { balanceWei, paused: paused as boolean };
    },
    async latestBlock() {
      const b = await pub.getBlock({ blockTag: "latest" });
      return { number: b.number, hash: b.hash };
    },
    async deviceKey(keyId) {
      const k = (await pub.readContract({ address, abi: registryAbi, functionName: "deviceKey", args: [keyId] })) as {
        qx: Hex;
        qy: Hex;
        revokedAtBlock: bigint;
      };
      return { qx: k.qx, qy: k.qy, revokedAtBlock: k.revokedAtBlock };
    },
    registerDeviceKey(keyId, qx, qy) {
      return submit(() => wallet.writeContract({ address, abi: registryAbi, functionName: "registerDeviceKey", args: [keyId, qx, qy] }));
    },
    async seal(keyId, record, auth) {
      const txHash = await submit(() =>
        wallet.writeContract({
          address,
          abi: registryAbi,
          functionName: "seal",
          args: [
            keyId,
            { ...record, tiles: record.tiles as never },
            { ...auth, challengeIndex: BigInt(auth.challengeIndex), typeIndex: BigInt(auth.typeIndex) },
          ],
        }),
      );
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash, pollingInterval: 100, timeout: e.RELAYER_RECEIPT_TIMEOUT_MS });
      if (receipt.status !== "success") throw new Error(`seal reverted: ${txHash}`);
      invalidateRegistry();
      return { txHash, blockNumber: receipt.blockNumber };
    },
    async importRecords(carrierId, records) {
      const txHash = await submit(() =>
        wallet.writeContract({
          address,
          abi: registryAbi,
          functionName: "importRecords",
          args: [carrierId, records.map((r) => ({ ...r, tiles: r.tiles as never }))],
        }),
      );
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash, pollingInterval: 100, timeout: e.RELAYER_RECEIPT_TIMEOUT_MS });
      if (receipt.status !== "success") throw new Error(`importRecords reverted: ${txHash}`);
      invalidateRegistry();
      return { txHash, blockNumber: receipt.blockNumber };
    },
  };
}

export function getRelayer(): Relayer {
  return processSingleton("relayer", createViemRelayer);
}
