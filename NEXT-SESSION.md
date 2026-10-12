# Next Session

Deferred ideas and follow-ups, highest priority first. Claude maintains this list; see "The next-session backlog" in `CLAUDE.md`.

- **2026-10-12** — Decide how production migrations run.
  `npm run db:deploy` is a manual step before merging any schema-changing PR, a shortcut taken for launch speed. Migrations should also use `DATABASE_URL_UNPOOLED` (Neon's direct connection) rather than the pooled `DATABASE_URL`. And each preview deploy gets its own Neon branch copied from production, but it only receives a PR's schema changes if the build runs migrations (for example `prisma migrate deploy` before `vite build`). Settle all three when the first model lands.
- **2026-10-12** — Decide what happens when a family adds a supporter as a family member.
  An email belongs to at most one person in a family, so adding a supporter's email as a family member needs a rule: promote the supporter, or refuse. Settle it when speccing slice 4 (managing people).
- **2026-10-12** — Run a manual Reddit search on CaringBridge and alternatives.
  The CaringBridge research agent couldn't reach Reddit, so the user-sentiment findings in `docs/research/caringbridge.md` come from app stores, review sites, and forums. Worth 20 minutes before the post-MVP features are specced.
