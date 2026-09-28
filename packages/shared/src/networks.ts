export type NetworkName = "testnet" | "mainnet";

export interface NetworkConfig {
  name: NetworkName;
  chainId: number;
  defaultRpcUrl: string;
  explorerUrl: string;
}

export const networks: Record<NetworkName, NetworkConfig> = {
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
