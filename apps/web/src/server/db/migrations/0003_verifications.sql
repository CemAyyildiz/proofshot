CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"submitted_exact_hash" text NOT NULL,
	"submitted_width" integer NOT NULL,
	"submitted_height" integer NOT NULL,
	"verdict" text NOT NULL,
	"alteration_check" text,
	"matched_exact_hash" text,
	"matched_kind" "registry_record_kind",
	"distance" integer,
	"altered_tiles" jsonb,
	"claim_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_claim_file_id_claim_files_id_fk" FOREIGN KEY ("claim_file_id") REFERENCES "public"."claim_files"("id") ON DELETE no action ON UPDATE no action;