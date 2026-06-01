ALTER TABLE "scan_patterns" ADD COLUMN IF NOT EXISTS "machine_generated" boolean NOT NULL DEFAULT false;
