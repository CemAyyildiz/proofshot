import { boolean, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
