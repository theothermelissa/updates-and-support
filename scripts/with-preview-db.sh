#!/usr/bin/env bash
# Runs a command against the shared preview database, using PREVIEW_DATABASE_URL and
# PREVIEW_DATABASE_URL_UNPOOLED from .env. (Vercel keeps its copies Sensitive, so they
# can't be pulled.) Usage: scripts/with-preview-db.sh <command> [args...]
set -euo pipefail
cd "$(dirname "$0")/.."
value() { grep "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
DATABASE_URL=$(value PREVIEW_DATABASE_URL)
DATABASE_URL_UNPOOLED=$(value PREVIEW_DATABASE_URL_UNPOOLED)
case "$DATABASE_URL$DATABASE_URL_UNPOOLED" in
  postgres*postgres*) ;;
  *)
    echo "Set PREVIEW_DATABASE_URL and PREVIEW_DATABASE_URL_UNPOOLED in .env to the Neon preview branch's pooled and direct connection strings." >&2
    exit 1
    ;;
esac
export DATABASE_URL DATABASE_URL_UNPOOLED
"$@"
