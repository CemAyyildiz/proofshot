CREATE TYPE "public"."registry_record_kind" AS ENUM('sealed', 'imported');--> statement-breakpoint
CREATE TABLE "indexer_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_records" (
	"chain_id" integer NOT NULL,
	"exact_hash" text NOT NULL,
	"kind" "registry_record_kind" NOT NULL,
	"p_hash" text NOT NULL,
	"tiles" jsonb NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"carrier_id" text NOT NULL,
	"key_id" text,
	"claim_ref" text,
	"ref_block" bigint,
	"device_time" bigint,
	"loc_commit" text,
	"block_number" bigint NOT NULL,
	"block_timestamp" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	CONSTRAINT "registry_records_chain_id_exact_hash_kind_pk" PRIMARY KEY("chain_id","exact_hash","kind")
);
--> statement-breakpoint
CREATE INDEX "registry_records_claim_ref_idx" ON "registry_records" USING btree ("claim_ref");