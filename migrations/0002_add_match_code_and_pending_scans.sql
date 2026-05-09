ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "match_code" text;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "matches_match_code_idx" ON "matches"("match_code");
EXCEPTION WHEN OTHERS THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "pending_scorecard_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"from_phone" text NOT NULL,
	"media_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scan_result" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "pending_scorecard_scans" ADD CONSTRAINT "pending_scorecard_scans_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
