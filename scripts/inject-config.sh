#!/usr/bin/env bash
# Substitute placeholders in config.js at deploy time.
# Usage: API_BASE=https://api.example.com SUPABASE_URL=... SUPABASE_ANON_KEY=... ./scripts/inject-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$ROOT/frontend/Static/js/config.example.js"
OUTPUT="$ROOT/frontend/Static/js/config.js"

API_BASE="${API_BASE:-/api}"
SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL required}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY required}"

sed \
  -e "s|http://localhost:8000|${API_BASE}|g" \
  -e "s|https://your-project.supabase.co|${SUPABASE_URL}|g" \
  -e "s|your-anon-key|${SUPABASE_ANON_KEY}|g" \
  "$TEMPLATE" > "$OUTPUT"

echo "Wrote $OUTPUT"
