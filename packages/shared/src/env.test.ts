import { describe, expect, it } from "vitest";
import { EnvError, loadServerEnv } from "./env";

describe("loadServerEnv", () => {
  it("defaults to testnet with its default RPC", () => {
    const env = loadServerEnv({});
    expect(env.network.chainId).toBe(10143);
    expect(env.rpcUrl).toBe("https://testnet-rpc.monad.xyz");
  });

  it("selects mainnet and honours an RPC override", () => {
    const env = loadServerEnv({ PROOFSHOT_NETWORK: "mainnet", RPC_URL: "https://rpc.example.org" });
    expect(env.network.chainId).toBe(143);
    expect(env.rpcUrl).toBe("https://rpc.example.org");
  });

  it("treats empty strings as unset", () => {
    expect(() => loadServerEnv({ REGISTRY_ADDRESS: "" })).not.toThrow();
  });

  it("fails fast with every invalid value listed", () => {
    try {
      loadServerEnv({ PROOFSHOT_NETWORK: "devnet", REGISTRY_ADDRESS: "0x123" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).issues).toHaveLength(2);
    }
  });
});
