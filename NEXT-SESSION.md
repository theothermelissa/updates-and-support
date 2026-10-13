# Next Session

Deferred ideas and follow-ups, highest priority first. Claude maintains this list; see "The next-session backlog" in `CLAUDE.md`.

- **2026-10-13** — Confirm the one-time verification send ran on production.
  Supporters who joined before email verification shipped get no notifications until verified. If Melissa hasn't yet run `DATABASE_URL=<production> npm run verification:send`, remind her; it shows a count and asks before sending.
- **2026-10-13** — Build slice 5, managing people: the last MVP feature.
  Adding and removing family members, the family's supporter list (with verified and notification status), removing and restoring supporters (and refusing a removed supporter who tries to rejoin), and changing the community question. See `spec/access.md`. Settle the "supporter added as family member" question below while speccing it.
- **2026-10-12** — Watch email deliverability through launch week.
  Test emails from the new `mail.orbul.com` sender land in Gmail spam even with SPF, DKIM, and DMARC passing; that's new-domain reputation. Check whether real sign-in and notification emails reach inboxes, whether Gmail starts showing its own "Unsubscribe" button (it hadn't for the first notifications, though the header is signed), tighten DMARC from `p=none` once mail flows reliably, and consider an HTML version of emails if plain text keeps getting filtered.
- **2026-10-12** — Revisit the gate's per-network limit on shared networks.
  Once a network reaches 30 wrong answers in an hour, every answer from it is refused, correct ones included. So one guesser on hospital or school Wi-Fi can lock out real supporters there for an hour. Watch for reports after the gate ships; if it happens, consider letting a correct answer through for a browser with no wrong answers of its own.
- **2026-10-12** — Decide what happens when a family adds a supporter as a family member.
  An email belongs to at most one person in a family, so adding a supporter's email as a family member needs a rule: promote the supporter, or refuse. Settle it when speccing slice 4 (managing people).
- **2026-10-12** — Run a manual Reddit search on CaringBridge and alternatives.
  The CaringBridge research agent couldn't reach Reddit, so the user-sentiment findings in `docs/research/caringbridge.md` come from app stores, review sites, and forums. Worth 20 minutes before the post-MVP features are specced.
- **2026-10-12** — Give `/` a simple page.
  The site root shows "Not found" because the spec only defines family addresses. A one-line page naming the app would reassure a stray visitor, without listing or linking any family.
- **2026-10-12** — Switch database URLs to `sslmode=verify-full`.
  `pg` warns that `sslmode=require` will mean weaker checking in its next major version. Today it already behaves as `verify-full`; saying so explicitly in the Vercel and local connection strings silences the warning and keeps the behavior after upgrades.
- **2026-10-13** — Give schema-changing PRs their own preview database if the shared one keeps colliding.
  All previews share the schema-only `preview` branch, which breaks when two open PRs change the schema or a PR's migration is abandoned; the fix today is recreating `preview` by hand (README → Deployment). If that happens often, script a schema-only Neon branch per PR with a branch-scoped Vercel variable and cleanup on merge.
