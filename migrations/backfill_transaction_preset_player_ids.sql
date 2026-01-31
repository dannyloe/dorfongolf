-- Migration: Backfill presetPlayerId for transaction tables
-- Run this in production to link existing transactions to preset players

-- Step 1: Backfill payerPresetPlayerId in ryderCupTransactions
UPDATE ryder_cup_transactions t
SET payer_preset_player_id = pp.id
FROM preset_players pp
WHERE t.payer_name = pp.name
AND t.payer_preset_player_id IS NULL;

-- Step 2: Backfill presetPlayerId in ryderCupTransactionSplits
UPDATE ryder_cup_transaction_splits s
SET preset_player_id = pp.id
FROM preset_players pp
WHERE s.player_name = pp.name
AND s.preset_player_id IS NULL;

-- Step 3: Sync names from preset_players to transactions (in case names were changed)
UPDATE ryder_cup_transactions t
SET payer_name = pp.name
FROM preset_players pp
WHERE t.payer_preset_player_id = pp.id
AND t.payer_name != pp.name;

UPDATE ryder_cup_transaction_splits s
SET player_name = pp.name
FROM preset_players pp
WHERE s.preset_player_id = pp.id
AND s.player_name != pp.name;
