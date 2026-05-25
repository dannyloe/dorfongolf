#!/bin/bash
set -e
npm install
# Apply SQL migration files directly (drizzle-kit push prompts interactively)
for f in migrations/[0-9]*.sql; do
  psql "$DATABASE_URL" -f "$f" 2>&1 | grep -v "^NOTICE\|already exists" || true
done
