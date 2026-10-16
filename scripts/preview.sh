#!/usr/bin/env bash
# Prints the current branch's preview address and the test family's link, and checks
# the deploy through Vercel's protection with VERCEL_AUTOMATION_BYPASS_SECRET from .env.
# With --sign-in, also prints a one-time sign-in link for the test family member.
# The address is the branch's stable alias, so a sign-in there lasts across pushes.
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

branch_url=$(npx vercel inspect "$url" --scope theothermelissa-s-team --format json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=(JSON.parse(s).aliases??[]).find(h=>h.includes("-git-"));if(a)console.log("https://"+a)})' || true)
url=${branch_url:-$url}

echo "Preview:     $url"
echo "Test family: $url/f/$TEST_SLUG"

secret=$(grep '^VERCEL_AUTOMATION_BYPASS_SECRET=' .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)
if [ -n "$secret" ]; then
  echo "Gate:        $(curl -s -H "x-vercel-protection-bypass: $secret" "$url/api/f/$TEST_SLUG/gate")"
fi

if [ "${1:-}" = "--sign-in" ]; then
  PREVIEW_URL="$url" scripts/with-preview-db.sh npx tsx scripts/sign-in-preview.ts
fi
