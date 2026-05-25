ALTER TABLE "pending_scorecard_scans" ADD COLUMN IF NOT EXISTS "image_url" text;
ALTER TABLE "pending_scorecard_scans" ADD COLUMN IF NOT EXISTS "correction_log_id" integer;
ALTER TABLE "scan_correction_logs" ADD COLUMN IF NOT EXISTS "image_url" text;
