CREATE TABLE IF NOT EXISTS "pending_sms_bets" (
  "id" serial PRIMARY KEY NOT NULL,
  "match_id" integer NOT NULL,
  "from_phone" text NOT NULL,
  "sender_name" text NOT NULL DEFAULT 'Unknown',
  "raw_text" text NOT NULL,
  "parsed_bets" jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "duplicate_of" text,
  "created_at" timestamp DEFAULT now()
);
