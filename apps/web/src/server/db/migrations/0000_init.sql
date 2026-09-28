CREATE TYPE "public"."claim_file_status" AS ENUM('awaiting_evidence', 'evidence_received');--> statement-breakpoint
CREATE TABLE "captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_file_id" uuid NOT NULL,
	"device_key_id" text NOT NULL,
	"exact_hash" text NOT NULL,
	"tx_hash" text NOT NULL,
	"loc_salt" text,
	"storage_key" text,
	"sealed_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "captures_exact_hash_unique" UNIQUE("exact_hash")
);
--> statement-breakpoint
CREATE TABLE "carriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"pseudonymous_id" text NOT NULL,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carriers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "carriers_pseudonymous_id_unique" UNIQUE("pseudonymous_id")
);
--> statement-breakpoint
CREATE TABLE "claim_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carrier_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" "claim_file_status" DEFAULT 'awaiting_evidence' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_links" (
	"token" text PRIMARY KEY NOT NULL,
	"claim_file_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"seal_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_links_claim_file_id_unique" UNIQUE("claim_file_id")
);
--> statement-breakpoint
CREATE TABLE "device_keys" (
	"key_id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"qx" text NOT NULL,
	"qy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_keys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "duplicate_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_file_id" uuid NOT NULL,
	"source_exact_hash" text NOT NULL,
	"matched_exact_hash" text NOT NULL,
	"same_carrier" boolean NOT NULL,
	"distance" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_file_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"exact_hash" text NOT NULL,
	"verdict" text NOT NULL,
	"matched_exact_hash" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carrier_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_claim_file_id_claim_files_id_fk" FOREIGN KEY ("claim_file_id") REFERENCES "public"."claim_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_device_key_id_device_keys_key_id_fk" FOREIGN KEY ("device_key_id") REFERENCES "public"."device_keys"("key_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_files" ADD CONSTRAINT "claim_files_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_files" ADD CONSTRAINT "claim_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_links" ADD CONSTRAINT "claim_links_claim_file_id_claim_files_id_fk" FOREIGN KEY ("claim_file_id") REFERENCES "public"."claim_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_alerts" ADD CONSTRAINT "duplicate_alerts_claim_file_id_claim_files_id_fk" FOREIGN KEY ("claim_file_id") REFERENCES "public"."claim_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_claim_file_id_claim_files_id_fk" FOREIGN KEY ("claim_file_id") REFERENCES "public"."claim_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "captures_claim_file_idx" ON "captures" USING btree ("claim_file_id");--> statement-breakpoint
CREATE INDEX "claim_files_carrier_idx" ON "claim_files" USING btree ("carrier_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_alerts_pair_idx" ON "duplicate_alerts" USING btree ("claim_file_id","source_exact_hash","matched_exact_hash");--> statement-breakpoint
CREATE INDEX "uploads_claim_file_idx" ON "uploads" USING btree ("claim_file_id");