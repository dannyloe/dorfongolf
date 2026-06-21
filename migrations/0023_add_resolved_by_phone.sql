ALTER TABLE "pending_scorecard_scans" ADD COLUMN IF NOT EXISTS "resolved_by_phone" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "pending_sms_bets" ADD COLUMN IF NOT EXISTS "resolved_by_phone" boolean DEFAULT false NOT NULL;
