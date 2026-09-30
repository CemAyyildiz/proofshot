CREATE TABLE "retired_claim_links" (
	"token" text PRIMARY KEY NOT NULL,
	"claim_file_id" uuid NOT NULL,
	"retired_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retired_claim_links" ADD CONSTRAINT "retired_claim_links_claim_file_id_claim_files_id_fk" FOREIGN KEY ("claim_file_id") REFERENCES "public"."claim_files"("id") ON DELETE no action ON UPDATE no action;