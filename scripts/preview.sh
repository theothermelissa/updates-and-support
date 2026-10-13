#!/usr/bin/env bash
# Prints the current branch's latest preview URL and the test family's link, and checks
# the deploy through Vercel's protection with VERCEL_AUTOMATION_BYPASS_SECRET from .env.
set -euo pipefail
cd "$(dirname "$0")/.."
TEST_SLUG="testfamily-preview" # matches scripts/seed-preview.ts
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
sha=$(git rev-parse HEAD)

deployment=$(gh api "repos/$repo/deployments?sha=$sha&environment=Preview" --jq '.[0].id // empty')
if [ -z "$deployment" ]; then
  echo "No preview for $(git rev-parse --short HEAD) yet. Has this commit been pushed?" >&2
  exit 1
fi
read -r state url < <(gh api "repos/$repo/deployments/$deployment/statuses" --jq '.[0] | "\(.state) \(.environment_url)"')
if [ "$state" != "success" ]; then
  echo "The preview for $(git rev-parse --short HEAD) is $state." >&2
  exit 1
fi

echo "Preview:     $url"
echo "Test family: $url/f/$TEST_SLUG"

secret=$(grep '^VERCEL_AUTOMATION_BYPASS_SECRET=' .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)
if [ -n "$secret" ]; then
  echo "Gate:        $(curl -s -H "x-vercel-protection-bypass: $secret" "$url/api/f/$TEST_SLUG/gate")"
fi
