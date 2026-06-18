#!/usr/bin/env bash
# Apply supabase_schema.sql to your remote Supabase project.
# Requires: psql, SUPABASE_DB_PASSWORD in environment (or .env at repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_REF="fyogufwysrxbgdgqzdqt"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Set SUPABASE_DB_PASSWORD (Supabase Dashboard → Project Settings → Database → password), then rerun:"
  echo "  SUPABASE_DB_PASSWORD='your-db-password' ./scripts/apply_supabase_schema.sh"
  exit 1
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
psql \
  "host=db.${PROJECT_REF}.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" \
  -f "$ROOT/supabase_schema.sql"

echo "Schema applied. PostgREST cache reload was included in the SQL."
