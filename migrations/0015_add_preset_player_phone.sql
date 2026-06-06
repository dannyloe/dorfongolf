ALTER TABLE "preset_players" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "preset_players_phone_unique" ON "preset_players" ("phone");
