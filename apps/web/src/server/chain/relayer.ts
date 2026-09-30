import "server-only";
import { type CaptureRecord, type Hex, type WebAuthnAuth, registryAbi } from "@proofshot/shared";
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, parseGwei, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "@/lib/env";
import { invalidateRegistry } from "../registry";
import { processSingleton } from "../singleton";
import { capFees } from "./fees";
import { assertWindowOpen } from "./readiness";
import { sendAtMostOnce } from "./send";
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
  /** Relayer balance (wei), whether the Registry is paused, and the current base fee (wei), for health checks. */
  status(): Promise<{ balanceWei: bigint; paused: boolean; baseFeeWei: bigint }>;
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
  const feeCap = parseGwei(String(e.RELAYER_MAX_FEE_GWEI));
  /** Current fees, capped; throws FeeTooHigh (before anything is sent) when the network is above the cap. */
  const fees = async () => {
    const [estimate, block] = await Promise.all([pub.estimateFeesPerGas(), pub.getBlock({ blockTag: "latest" })]);
    return { fees: capFees(estimate, block.baseFeePerGas ?? 0n, feeCap), head: block.number };
  };

  // Serialise submissions from this process so nonces are handed out in order. Races with another instance (e.g.
  // during a zero-downtime deploy) and lost responses are handled per write by `sendAtMostOnce`.
  let queue: Promise<unknown> = Promise.resolve();
  const submit = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };

  type WriteName = "registerDeviceKey" | "seal" | "importRecords";
  /**
   * Estimates against the ABI (so a revert is reported by name, e.g. `DeviceKeyExists`), signs, and sends once.
   * `guard` sees the latest block first and can refuse to send.
   */
  const write = (functionName: WriteName, args: readonly unknown[], guard?: (head: bigint) => void) =>
    submit(() =>
      sendAtMostOnce({
        sign: async () => {
          const call = { address, abi: registryAbi, functionName, args, account } as never;
          // The estimate is the gas limit, unpadded: Monad charges the limit, not the gas used.
          const [{ fees: f, head }, gas] = await Promise.all([fees(), pub.estimateContractGas(call)]);
          guard?.(head);
          const request = await wallet.prepareTransactionRequest({ to: address, data: encodeFunctionData({ abi: registryAbi, functionName, args } as never), gas, ...f });
          return wallet.signTransaction(request as never);
        },
        send: (raw) => wallet.sendRawTransaction({ serializedTransaction: raw }),
        known: (hash) => pub.getTransaction({ hash }).then(() => true),
      }),
    );

  return {
    async status() {
      const [balanceWei, paused, block] = await Promise.all([
        pub.getBalance({ address: account.address }),
        pub.readContract({ address, abi: registryAbi, functionName: "paused" }),
        pub.getBlock({ blockTag: "latest" }),
      ]);
      return { balanceWei, paused: paused as boolean, baseFeeWei: block.baseFeePerGas ?? 0n };
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
      return write("registerDeviceKey", [keyId, qx, qy]);
    },
    async seal(keyId, record, auth) {
      const txHash = await write(
        "seal",
        [keyId, { ...record, tiles: record.tiles }, { ...auth, challengeIndex: BigInt(auth.challengeIndex), typeIndex: BigInt(auth.typeIndex) }],
        (head) => assertWindowOpen(record.refBlock, head),
      );
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash, pollingInterval: 100, timeout: e.RELAYER_RECEIPT_TIMEOUT_MS });
      if (receipt.status !== "success") throw new Error(`seal reverted: ${txHash}`);
      invalidateRegistry();
      return { txHash, blockNumber: receipt.blockNumber };
    },
    async importRecords(carrierId, records) {
      const txHash = await write("importRecords", [carrierId, records]);
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
