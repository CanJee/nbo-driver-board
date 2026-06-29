#!/usr/bin/env bash
set -euo pipefail

# On Vercel PREVIEW deploys, the Supabase–Vercel integration injects the preview
# branch DB's credentials as SUPABASE_* (and POSTGRES_*). Alias them to the
# NEXT_PUBLIC_* names the app reads — this MUST happen before `next build`, since
# Next.js inlines NEXT_PUBLIC_* at build time. Result: previews hit the preview
# branch DB, never prod.
if [ "${VERCEL_ENV:-}" = "preview" ] && [ -n "${SUPABASE_URL:-}" ]; then
  export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}"
  echo "[vercel-build] Preview: aliased NEXT_PUBLIC_SUPABASE_URL to the preview branch."
fi

# Seed the freshly-created preview branch DB with a copy of prod data.
# Self-skips on non-preview builds and when prod credentials aren't configured.
node scripts/clone-prod-to-preview.mjs

# Build the app.
./node_modules/.bin/next build
