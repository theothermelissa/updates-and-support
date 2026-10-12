# Next Session

Deferred ideas and follow-ups, highest priority first. Claude maintains this list; see "The next-session backlog" in `CLAUDE.md`.

- **2026-10-12** — Confirm Neon's database branching before real data goes in.
  Two settings in the Vercel–Neon connection are unverified. Preview branching was switched on, but the settings dialog didn't show it as saved; the first PR's preview deploy should create a `preview/...` branch in the Neon console. The Production branching box is checked, and neither Neon's nor Vercel's docs say what it does; test that a row written in production survives a redeploy, and if it doesn't, turn the box off.
- **2026-10-12** — Decide how production migrations run.
  `npm run db:deploy` is a manual step before merging any schema-changing PR, a shortcut taken for launch speed. Migrations should also use `DATABASE_URL_UNPOOLED` (Neon's direct connection) rather than the pooled `DATABASE_URL`. Settle both when the first model lands.
- **2026-10-12** — Run a manual Reddit search on CaringBridge and alternatives.
  The CaringBridge research agent couldn't reach Reddit, so the user-sentiment findings in `docs/research/caringbridge.md` come from app stores, review sites, and forums. Worth 20 minutes before the post-MVP features are specced.
