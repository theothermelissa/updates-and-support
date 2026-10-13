#!/usr/bin/env bash
# Records main's migrations as applied on a freshly created schema-only preview branch.
# Neon copies production's tables but not the rows of _prisma_migrations, so without this
# the next preview build tries to create every table again. Only main's migrations are
# marked, since those are exactly what production has; a PR's new ones still run in its
# preview build. Run through `npm run preview:baseline`.
set -euo pipefail
git fetch -q origin main
for migration in $(git ls-tree --name-only origin/main prisma/migrations/ | xargs -n1 basename | grep -v '\.toml$'); do
  npx prisma migrate resolve --applied "$migration" 2>&1 | grep -E "marked as applied|P3008|Error" || true
done
