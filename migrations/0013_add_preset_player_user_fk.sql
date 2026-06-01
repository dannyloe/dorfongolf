-- Add userId FK column to preset_players for hard link between player and user account
ALTER TABLE "preset_players" ADD COLUMN IF NOT EXISTS "user_id" text UNIQUE REFERENCES "users"("id") ON DELETE SET NULL;

-- Backfill: populate preset_players.user_id from users.preset_player_name where name matches
UPDATE "preset_players" pp
SET "user_id" = u.id
FROM "users" u
WHERE u.preset_player_name = pp.name
  AND pp.user_id IS NULL;
