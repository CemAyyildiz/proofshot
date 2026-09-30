import { z } from "zod";
import { networks, type NetworkConfig } from "./networks";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");

/**
 * Server-side environment. Values not needed yet are optional so the skeleton
 * boots; later stories tighten them (e.g. RELAYER_PRIVATE_KEY once sealing ships).
 */
export const serverEnvSchema = z.object({
  PROOFSHOT_NETWORK: z.enum(["local", "testnet", "mainnet"]).default("testnet"),
  RPC_URL: z.url().optional(),
  RPC_URL_SECONDARY: z.url().optional(),
  /**
   * RPC shown to the public (the receipt's "Verify it yourself" command). Never RPC_URL: a provider URL often embeds an
   * API key. Defaults to the network's public endpoint.
   */
  PUBLIC_RPC_URL: z.url().optional(),
  /** Public source repository, linked from the landing page and footer when set. */
  PUBLIC_REPO_URL: z.url().optional(),
  REGISTRY_ADDRESS: address.optional(),
  /** Block the Registry was deployed in; the indexer starts here. */
  REGISTRY_DEPLOY_BLOCK: z.coerce.bigint().nonnegative().default(0n),
  /** Max block span per eth_getLogs call; public RPCs cap this (Monad public RPC: 100). */
  LOGS_BLOCK_RANGE: z.coerce.bigint().positive().default(1000n),
  RELAYER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex key")
    .optional(),
  /** How long a Seal request waits for its transaction before telling the Capturer to retry (a retry reconciles). */
  RELAYER_RECEIPT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  /** /api/health reports unhealthy (503) below this relayer balance, so uptime monitoring alerts before Seals fail. */
  RELAYER_MIN_BALANCE_MON: z.coerce.number().nonnegative().default(1),
  /** Highest total gas price (base + priority, gwei) the relayer will pay; above it, writes pause instead of draining funds. */
  RELAYER_MAX_FEE_GWEI: z.coerce.number().positive().default(500),
  DATABASE_URL: z.string().min(1).optional(),
  /** Where evidence images live: "fs" (a persistent disk) or "s3" (any S3-compatible bucket, e.g. Cloudflare R2). */
  STORAGE_DRIVER: z.enum(["fs", "s3"]).default("fs"),
  /** fs driver: absolute directory. Unset: apps/web/.data/storage. */
  STORAGE_DIR: z.string().startsWith("/").optional(),
  /** s3 driver: a PRIVATE bucket; objects are only ever served through the tenant-checked Console routes. */
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default("auto"),
  /** Custom endpoint for S3-compatible stores (R2: https://<account>.r2.cloudflarestorage.com). Unset: AWS. */
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Public origin used in emailed links, e.g. https://proofshot.app. */
  APP_URL: z.url().default("http://localhost:3000"),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).default("Proofshot <login@proofshot.app>"),
  /** Sign-in links per address per hour (raised only in automated tests). */
  /** Shared secret the hosting scheduler sends to /api/cron/maintenance. Unset: the route is disabled. */
  CRON_SECRET: z.string().min(16).optional(),
  /** "1" lets visitors enter the seeded demo carriers' Console with one tap (no email). Never touches real carriers. */
  DEMO_ACCESS: z.enum(["0", "1"]).default("0"),
  /** "1" exposes developer spike pages (/spike/passkey) in production, e.g. for real-device fixtures. */
  ENABLE_SPIKE_PAGES: z.enum(["0", "1"]).default("0"),
  /** "1" allows the dev outbox (links in logs and .data/outbox.jsonl) in production builds — automated tests only. */
  MAIL_DEV_OUTBOX: z.enum(["0", "1"]).default("0"),
  SIGNIN_LIMIT_PER_EMAIL: z.coerce.number().int().positive().default(5),
  /** Sign-in link requests per client address per hour (tests raise it: the whole suite shares one address). */
  SIGNIN_LIMIT_PER_CLIENT: z.coerce.number().int().positive().default(20),
  /** New Claim Files per visitor (client address) per day in the one-tap demo Console (tests raise it, as above). */
  DEMO_CLAIM_FILES_PER_VISITOR: z.coerce.number().int().positive().default(20),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & { network: NetworkConfig; rpcUrl: string; publicRpcUrl: string };

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
  return {
    ...parsed.data,
    network,
    rpcUrl: parsed.data.RPC_URL ?? network.defaultRpcUrl,
    publicRpcUrl: parsed.data.PUBLIC_RPC_URL ?? network.defaultRpcUrl,
  };
}
