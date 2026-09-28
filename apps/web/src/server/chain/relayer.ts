import "server-only";
import { type CaptureRecord, type Hex, type WebAuthnAuth, registryAbi } from "@proofshot/shared";
import { createPublicClient, createWalletClient, defineChain, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "@/lib/env";
import { processSingleton } from "../singleton";

export interface SealResult {
  txHash: Hex;
  blockNumber: bigint;
}

/** Onchain side effects, behind an interface so routes can be tested without a chain. */
export interface Relayer {
  latestBlock(): Promise<{ number: bigint; hash: Hex }>;
  /** Submits and returns without waiting: later relayer txs are nonce-ordered after it. */
  registerDeviceKey(keyId: Hex, qx: Hex, qy: Hex): Promise<Hex>;
  seal(keyId: Hex, record: CaptureRecord, auth: WebAuthnAuth): Promise<SealResult>;
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
  const transport = http(e.rpcUrl, { retryCount: 2 });
  const pub = createPublicClient({ chain, transport }) as PublicClient;
  const account = privateKeyToAccount(e.RELAYER_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ chain, transport, account });
  const address = e.REGISTRY_ADDRESS as Hex;

  // Serialise submissions from this process so nonces are handed out in order; retry if another
  // instance raced us to a nonce.
  let queue: Promise<unknown> = Promise.resolve();
  const submit = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn();
        } catch (err) {
          if (attempt < 3 && NONCE_ERRORS.test(String(err))) continue;
          throw err;
        }
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    async latestBlock() {
      const b = await pub.getBlock({ blockTag: "latest" });
      return { number: b.number, hash: b.hash };
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
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash, pollingInterval: 100 });
      if (receipt.status !== "success") throw new Error(`seal reverted: ${txHash}`);
      return { txHash, blockNumber: receipt.blockNumber };
    },
  };
}

export function getRelayer(): Relayer {
  return processSingleton("relayer", createViemRelayer);
}
