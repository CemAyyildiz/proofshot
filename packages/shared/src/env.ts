import { z } from "zod";
import { networks, type NetworkConfig } from "./networks";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");

/**
 * Server-side environment. Values not needed yet are optional so the skeleton
 * boots; later stories tighten them (e.g. RELAYER_PRIVATE_KEY once sealing ships).
 */
export const serverEnvSchema = z.object({
  PROOFSHOT_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  RPC_URL: z.url().optional(),
  RPC_URL_SECONDARY: z.url().optional(),
  REGISTRY_ADDRESS: address.optional(),
  RELAYER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex key")
    .optional(),
  DATABASE_URL: z.string().min(1).optional(),
  /** Public origin used in emailed links, e.g. https://proofshot.app. */
  APP_URL: z.url().default("http://localhost:3000"),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).default("Proofshot <login@proofshot.app>"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & { network: NetworkConfig; rpcUrl: string };

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment:\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvError";
  }
}

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  // Treat empty strings as unset so `.env` placeholders don't fail URL validation.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const parsed = serverEnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const network = networks[parsed.data.PROOFSHOT_NETWORK];
  return { ...parsed.data, network, rpcUrl: parsed.data.RPC_URL ?? network.defaultRpcUrl };
}
