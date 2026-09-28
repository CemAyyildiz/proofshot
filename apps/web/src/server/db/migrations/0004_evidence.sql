ALTER TABLE "duplicate_alerts" ADD COLUMN "matched_kind" "registry_record_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "duplicate_alerts" ADD COLUMN "matched_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "duplicate_alerts" ADD COLUMN "exact" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "duplicate_alerts" ADD COLUMN "tile_matches" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "preview_key" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "verification_id" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_verification_id_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verifications"("id") ON DELETE no action ON UPDATE no action;