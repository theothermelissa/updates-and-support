# Next Session

Deferred ideas and follow-ups, highest priority first. Claude maintains this list; see "The next-session backlog" in `CLAUDE.md`.

- **2026-10-12** — Spec the supporter gate (slice 2).
  Families can post as of this slice, but supporters can't read anything until the gate lands. It's the next feature; slices 3 (notifications) and 4 (managing people) follow, as listed in the completed plan for families and updates.
- **2026-10-12** — Watch email deliverability through launch week.
  Test emails from the new `mail.orbul.com` sender land in Gmail spam even with SPF, DKIM, and DMARC passing; that's new-domain reputation. Check whether real sign-in emails reach inboxes, tighten DMARC from `p=none` once mail flows reliably, and consider an HTML version of emails if plain text keeps getting filtered.
- **2026-10-12** — Decide what happens when a family adds a supporter as a family member.
  An email belongs to at most one person in a family, so adding a supporter's email as a family member needs a rule: promote the supporter, or refuse. Settle it when speccing slice 4 (managing people).
- **2026-10-12** — Run a manual Reddit search on CaringBridge and alternatives.
  The CaringBridge research agent couldn't reach Reddit, so the user-sentiment findings in `docs/research/caringbridge.md` come from app stores, review sites, and forums. Worth 20 minutes before the post-MVP features are specced.
- **2026-10-12** — Give `/` a simple page.
  The site root shows "Not found" because the spec only defines family addresses. A one-line page naming the app would reassure a stray visitor, without listing or linking any family.
- **2026-10-12** — Switch database URLs to `sslmode=verify-full`.
  `pg` warns that `sslmode=require` will mean weaker checking in its next major version. Today it already behaves as `verify-full`; saying so explicitly in the Vercel and local connection strings silences the warning and keeps the behavior after upgrades.
