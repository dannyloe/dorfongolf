CREATE TABLE IF NOT EXISTS "sms_opt_ins" (
  "id" serial PRIMARY KEY NOT NULL,
  "phone_number" text NOT NULL,
  "consent_given" boolean NOT NULL DEFAULT false,
  "opted_in_at" timestamp DEFAULT now(),
  "user_id" text
);
