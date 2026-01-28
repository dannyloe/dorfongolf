-- Migration script to backfill presetPlayerId columns from existing name values
-- Run this in production database after deploying the schema changes

-- 1. Backfill players table (regular matches)
UPDATE players p
SET preset_player_id = pp.id
FROM preset_players pp
WHERE p.name = pp.name
  AND p.preset_player_id IS NULL;

-- 2. Backfill ryder_cup_skins table
UPDATE ryder_cup_skins s
SET winner_preset_player_id = pp.id
FROM preset_players pp
WHERE s.winner_name = pp.name
  AND s.winner_preset_player_id IS NULL;

-- 3. Backfill ryder_cup_closest_to_hole table
UPDATE ryder_cup_closest_to_hole cth
SET winner_preset_player_id = pp.id
FROM preset_players pp
WHERE cth.winner_name = pp.name
  AND cth.winner_preset_player_id IS NULL;

-- 4. Backfill ryder_cup_team_members table (already has presetPlayerId column)
UPDATE ryder_cup_team_members tm
SET preset_player_id = pp.id
FROM preset_players pp
WHERE tm.player_name = pp.name
  AND tm.preset_player_id IS NULL;

-- Verify counts
SELECT 'players' as table_name, 
       COUNT(*) as total,
       COUNT(preset_player_id) as with_id,
       COUNT(*) - COUNT(preset_player_id) as missing_id
FROM players
UNION ALL
SELECT 'ryder_cup_skins',
       COUNT(*),
       COUNT(winner_preset_player_id),
       COUNT(*) - COUNT(winner_preset_player_id)
FROM ryder_cup_skins
WHERE winner_name IS NOT NULL
UNION ALL
SELECT 'ryder_cup_closest_to_hole',
       COUNT(*),
       COUNT(winner_preset_player_id),
       COUNT(*) - COUNT(winner_preset_player_id)
FROM ryder_cup_closest_to_hole
WHERE winner_name IS NOT NULL
UNION ALL
SELECT 'ryder_cup_team_members',
       COUNT(*),
       COUNT(preset_player_id),
       COUNT(*) - COUNT(preset_player_id)
FROM ryder_cup_team_members;
