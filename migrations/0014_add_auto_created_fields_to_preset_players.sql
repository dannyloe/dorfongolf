ALTER TABLE "preset_players" ADD COLUMN IF NOT EXISTS "is_auto_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preset_players" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp;
