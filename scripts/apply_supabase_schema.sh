#!/usr/bin/env bash
# Apply Supabase schema migrations in order.
# Requires: psql, SUPABASE_DB_PASSWORD in environment (or .env at repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "Set SUPABASE_URL in .env (e.g. https://your-project.supabase.co)"
  exit 1
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$PROJECT_REF" ]]; then
  PROJECT_REF="$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co.*|\1|')"
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Set SUPABASE_DB_PASSWORD (Supabase Dashboard → Project Settings → Database → password), then rerun:"
  echo "  SUPABASE_DB_PASSWORD='your-db-password' ./scripts/apply_supabase_schema.sh"
  exit 1
fi

SQL_FILES=(
  "$ROOT/supabase_schema.sql"
  "$ROOT/supabase_fix_wishlist.sql"
  "$ROOT/supabase_migrations/002_movies_rls_lockdown.sql"
  "$ROOT/supabase_migrations/003_retention_cleanup.sql"
)

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
CONN="host=db.${PROJECT_REF}.supabase.co port=5432 dbname=postgres user=postgres sslmode=require"

for f in "${SQL_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    echo "Applying $(basename "$f")..."
    psql "$CONN" -f "$f"
  fi
done

echo "Schema applied (project ref: ${PROJECT_REF})."
