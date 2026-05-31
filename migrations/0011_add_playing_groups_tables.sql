-- Create event playing groups tables for the Playing Groups feature
CREATE TABLE IF NOT EXISTS event_playing_groups (
  id serial PRIMARY KEY,
  event_id integer NOT NULL,
  group_number integer NOT NULL,
  generated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_playing_group_members (
  id serial PRIMARY KEY,
  group_id integer NOT NULL,
  player_name text NOT NULL,
  team_member_id integer,
  member_index integer NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false
);

-- Add team_member_id column if table already exists without it
ALTER TABLE event_playing_group_members
  ADD COLUMN IF NOT EXISTS team_member_id integer;
