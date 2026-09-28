import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Insurer organization. Onchain it is known only by `pseudonymousId` (bytes32 hex). */
export const carriers = pgTable("carriers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  pseudonymousId: text("pseudonymous_id").notNull().unique(),
  isSandbox: boolean("is_sandbox").notNull().default(false),
  createdAt: createdAt(),
});

/** Carrier User. Belongs to exactly one Carrier; the only role is "member". */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id")
    .notNull()
    .references(() => carriers.id),
  email: text("email").notNull().unique(),
  createdAt: createdAt(),
});

/** Single-use magic-link tokens; only the SHA-256 of the token is stored. */
export const magicLinkTokens = pgTable("magic_link_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Console sessions; only the SHA-256 of the cookie token is stored. */
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const claimFileStatus = pgEnum("claim_file_status", ["awaiting_evidence", "evidence_received"]);

export const claimFiles = pgTable(
  "claim_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id")
      .notNull()
      .references(() => carriers.id),
    reference: text("reference").notNull(),
    status: claimFileStatus("status").notNull().default("awaiting_evidence"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("claim_files_carrier_idx").on(t.carrierId, t.createdAt)],
);

/** Bearer link for Capturers. One per Claim File; revocable and expiring. */
export const claimLinks = pgTable("claim_links", {
  token: text("token").primaryKey(),
  claimFileId: uuid("claim_file_id")
    .notNull()
    .unique()
    .references(() => claimFiles.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  sealCount: integer("seal_count").notNull().default(0),
  createdAt: createdAt(),
});

/** Registered passkeys. `keyId` is the bytes32 used onchain. */
export const deviceKeys = pgTable("device_keys", {
  keyId: text("key_id").primaryKey(),
  credentialId: text("credential_id").notNull().unique(),
  qx: text("qx").notNull(),
  qy: text("qy").notNull(),
  createdAt: createdAt(),
});

export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimFileId: uuid("claim_file_id")
      .notNull()
      .references(() => claimFiles.id),
    deviceKeyId: text("device_key_id")
      .notNull()
      .references(() => deviceKeys.keyId),
    exactHash: text("exact_hash").notNull().unique(),
    txHash: text("tx_hash").notNull(),
    /** Location Commitment salt; only the Carrier and Capturer hold it. */
    locSalt: text("loc_salt"),
    storageKey: text("storage_key"),
    sealedAt: timestamp("sealed_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Client-measured timings for the SM-5 latency report. */
    timings: jsonb("timings").$type<{ shutterToSignedMs?: number; shutterToSealedMs?: number }>(),
  },
  (t) => [index("captures_claim_file_idx").on(t.claimFileId)],
);

/** Images a Carrier User uploaded into a Claim File for Verification. */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimFileId: uuid("claim_file_id")
      .notNull()
      .references(() => claimFiles.id),
    storageKey: text("storage_key").notNull(),
    exactHash: text("exact_hash").notNull(),
    verdict: text("verdict").notNull(),
    matchedExactHash: text("matched_exact_hash"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_claim_file_idx").on(t.claimFileId)],
);

export const duplicateAlerts = pgTable(
  "duplicate_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimFileId: uuid("claim_file_id")
      .notNull()
      .references(() => claimFiles.id),
    sourceExactHash: text("source_exact_hash").notNull(),
    matchedExactHash: text("matched_exact_hash").notNull(),
    sameCarrier: boolean("same_carrier").notNull(),
    distance: integer("distance").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("duplicate_alerts_pair_idx").on(t.claimFileId, t.sourceExactHash, t.matchedExactHash)],
);

/** Fixed-window counters for fee-sponsorship limits (FR-7). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);

// ─── Registry index (derived from chain events; rebuildable) ──────────────────────────────────────────────

export const registryRecordKind = pgEnum("registry_record_kind", ["sealed", "imported"]);

/** One row per `CaptureSealed` / `RecordImported` event. The chain is the source of truth. */
export const registryRecords = pgTable(
  "registry_records",
  {
    chainId: integer("chain_id").notNull(),
    exactHash: text("exact_hash").notNull(),
    kind: registryRecordKind("kind").notNull(),
    pHash: text("p_hash").notNull(),
    tiles: jsonb("tiles").$type<string[]>().notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    carrierId: text("carrier_id").notNull(),
    keyId: text("key_id"),
    claimRef: text("claim_ref"),
    refBlock: bigint("ref_block", { mode: "bigint" }),
    deviceTime: bigint("device_time", { mode: "bigint" }),
    locCommit: text("loc_commit"),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockTimestamp: bigint("block_timestamp", { mode: "number" }).notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
  },
  (t) => [
    // A hash can be both imported and later sealed (the contract allows that order), so key by kind too.
    primaryKey({ columns: [t.chainId, t.exactHash, t.kind] }),
    index("registry_records_claim_ref_idx").on(t.claimRef),
  ],
);

export const indexerState = pgTable("indexer_state", {
  /** `${chainId}:${registryAddress}` */
  id: text("id").primaryKey(),
  lastBlock: bigint("last_block", { mode: "bigint" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A Verification's outcome, so its Receipt has a stable URL. Never the image: only the submitted file's
 * fingerprints and the Verdict (FR-8, FR-9).
 */
export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  submittedExactHash: text("submitted_exact_hash").notNull(),
  submittedWidth: integer("submitted_width").notNull(),
  submittedHeight: integer("submitted_height").notNull(),
  verdict: text("verdict").$type<"original" | "derived-copy" | "altered" | "no-record">().notNull(),
  alterationCheck: text("alteration_check").$type<"passed" | "failed" | "unavailable">(),
  matchedExactHash: text("matched_exact_hash"),
  matchedKind: registryRecordKind("matched_kind"),
  distance: integer("distance"),
  alteredTiles: jsonb("altered_tiles").$type<number[]>(),
  /** Claim File the image was uploaded into (Console); null for the Public Verifier. */
  claimFileId: uuid("claim_file_id").references(() => claimFiles.id),
  createdAt: createdAt(),
});
