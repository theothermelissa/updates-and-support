#!/usr/bin/env bash
# Seeds the shared preview database. Pulls Vercel's Preview environment into a temporary
# file, uses only its DATABASE_URL, and deletes the file, so no credentials linger.
set -euo pipefail
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
npx vercel env pull "$tmp" --environment=preview --yes >/dev/null 2>&1
url=$(grep '^DATABASE_URL=' "$tmp" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
if [ -z "$url" ]; then
  echo "Vercel's Preview environment has no DATABASE_URL (or it's marked Sensitive, which can't be pulled)." >&2
  exit 1
fi
DATABASE_URL="$url" npx tsx scripts/seed-preview.ts
