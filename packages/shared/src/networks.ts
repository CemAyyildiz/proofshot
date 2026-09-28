export type NetworkName = "local" | "testnet" | "mainnet";

export interface NetworkConfig {
  name: NetworkName;
  chainId: number;
  defaultRpcUrl: string;
  explorerUrl: string;
}

export const networks: Record<NetworkName, NetworkConfig> = {
  /** Anvil (Osaka hardfork, so the P256 precompile exists) started by `pnpm dev:chain`. */
  local: {
    name: "local",
    chainId: 31337,
    defaultRpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "",
  },
  testnet: {
    name: "testnet",
    chainId: 10143,
    defaultRpcUrl: "https://testnet-rpc.monad.xyz",
    explorerUrl: "https://testnet.monadexplorer.com",
  },
  mainnet: {
    name: "mainnet",
    chainId: 143,
    defaultRpcUrl: "https://rpc.monad.xyz",
    explorerUrl: "https://monadexplorer.com",
  },
};
