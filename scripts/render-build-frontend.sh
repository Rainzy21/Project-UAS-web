#!/usr/bin/env bash
# Render static-site build: inject config.js from environment variables.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# API_BASE: set explicitly, or build from API_HOST (Render blueprint linking).
if [[ -z "${API_BASE:-}" ]]; then
  if [[ -n "${API_HOST:-}" ]]; then
    API_BASE="https://${API_HOST}"
  elif [[ -n "${RENDER_API_URL:-}" ]]; then
    API_BASE="$RENDER_API_URL"
  else
    echo "ERROR: Set API_BASE or API_HOST for the static site build." >&2
    exit 1
  fi
fi

export API_BASE
export SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL required}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY required}"

"$ROOT/scripts/inject-config.sh"
echo "Frontend config ready for Render static publish."
