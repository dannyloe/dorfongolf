CREATE TABLE IF NOT EXISTS "scan_correction_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "match_id" integer NOT NULL,
  "pending_scan_id" integer,
  "course_name" text NOT NULL,
  "gemini_output" jsonb NOT NULL,
  "applied_output" jsonb NOT NULL,
  "player_names" text[] NOT NULL,
  "created_at" timestamp DEFAULT now()
);
