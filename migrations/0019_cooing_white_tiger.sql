CREATE TABLE "scan_comparisons" (
        "id" serial PRIMARY KEY NOT NULL,
        "player_names" text[] DEFAULT '{}' NOT NULL,
        "image_thumbnail" text,
        "gemini_result" jsonb NOT NULL,
        "grok_result" jsonb NOT NULL,
        "total_holes" integer DEFAULT 0 NOT NULL,
        "matched_holes" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now()
);
