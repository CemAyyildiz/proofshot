export type NetworkName = "local" | "testnet" | "mainnet";

export interface NetworkConfig {
  name: NetworkName;
  chainId: number;
  defaultRpcUrl: string;
  explorerUrl: string;
  /**
   * Recent blocks the indexer re-reads on every sync. Catches logs a lagging RPC node left out the first time and
   * detects reorged blocks, at the cost of one extra small eth_getLogs.
   */
  rescanBlocks: bigint;
}

export const networks: Record<NetworkName, NetworkConfig> = {
  /** Anvil (Osaka hardfork, so the P256 precompile exists) started by `pnpm dev:chain`. */
  local: {
    name: "local",
    chainId: 31337,
    defaultRpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "",
    rescanBlocks: 0n, // one Anvil node, no reorgs
  },
  testnet: {
    name: "testnet",
    chainId: 10143,
    defaultRpcUrl: "https://testnet-rpc.monad.xyz",
    explorerUrl: "https://testnet.monadexplorer.com",
    rescanBlocks: 64n, // ~19 s at the measured ~300 ms block time, far past finality
  },
  mainnet: {
    name: "mainnet",
    chainId: 143,
    defaultRpcUrl: "https://rpc.monad.xyz",
    explorerUrl: "https://monadexplorer.com",
    rescanBlocks: 64n,
  },
};
