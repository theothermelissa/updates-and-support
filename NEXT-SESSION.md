# Next Session

Deferred ideas and follow-ups, highest priority first. Claude maintains this list; see "The next-session backlog" in `CLAUDE.md`.

- **2026-10-15** — Decide whether to remove a real family's names from `main`'s history.
  A rename PR committed a real person's name, the family's surname, and their address to this public repo. They're gone from the files now, but one commit message on `main` still has the name, and the earlier file versions remain in history. Removing them means rewriting `main` and force-pushing, which is Melissa's call.

- **2026-10-16** — Build a profile page where people change their own name.
  Notes and the email form show a stored name read-only, by Melissa's decision: names change on a profile, which doesn't exist yet. A changed name re-signs that person's earlier notes and reactions. Came up while building notes.
- **2026-10-16** — Let a family member delete all of one author's notes at once.
  A nameless reader who signs notes isn't on the People page, so the only remedies for a flood are deleting notes one by one (capped at 20 an hour per person) or changing the answer. Raised in the notes plan's access review.
- **2026-10-16** — Let authors edit their notes.
  Cut from the notes slice for speed; today they delete and leave another. Also in the spec's Later list.
- **2026-10-16** — Backfill `Update.content`, then drop `body` and `{ body }` requests.
  Updates from before formatting have no content and are converted from `body` each time the feed loads, and `body` is kept in step so older code still works during a deploy or rollback. Once formatting has been live a while, backfill `content` with `docFromText`, make it required, and remove the `body` fallbacks; the wall's excerpts would then need `textOf`.
- **2026-10-15** — End a supporter's other sessions when their email is first verified.
  Someone who knows the answer can give the email of a real person not yet on the list; if that person confirms it, the device that gave it becomes a verified supporter that survives answer changes (Stated limits in `spec/access.md`). Melissa accepted this to ship reading before email. The fix: on first verification, delete the record's sessions except the verifying browser's; the cost is one more answer for someone who confirms in a different browser. A family member's Verify on the People page deliberately signs no one out, so this applies only when the email's owner confirms.
- **2026-10-15** — Let a supporter change an email they haven't confirmed.
  A typo in the feed's email prompt leaves them without notifications, and the only fix is signing out and answering again. Allow replacing an unverified email, cancelling its old verify link.
- **2026-10-14** — Lock the person row when signing in by magic link.
  A sign-in can race promotion or removal and keep a session that `deleteMany` missed. The verify-link sign-in for added supporters gets a `FOR UPDATE` lock; `signInWithLink` should reuse it.
- **2026-10-14** — Show People page messages next to the form that caused them.
  "Added Tess…" and add errors appear at the top of the page, out of view of the supporter form further down. Toasts (shadcn's `sonner`), planned for upcoming features, are the natural fix.
- **2026-10-12** — Watch email deliverability through launch week.
  Test emails from the new `mail.orbul.com` sender land in Gmail spam even with SPF, DKIM, and DMARC passing; that's new-domain reputation. Check whether real sign-in and notification emails reach inboxes, whether Gmail starts showing its own "Unsubscribe" button (it hadn't for the first notifications, though the header is signed), tighten DMARC from `p=none` once mail flows reliably, and consider an HTML version of emails if plain text keeps getting filtered.
- **2026-10-12** — Revisit the gate's per-network limit on shared networks.
  Once a network reaches 30 wrong answers in an hour, every answer from it is refused, correct ones included. So one guesser on hospital or school Wi-Fi can lock out real supporters there for an hour. Watch for reports after the gate ships; if it happens, consider letting a correct answer through for a browser with no wrong answers of its own.
- **2026-10-12** — Run a manual Reddit search on CaringBridge and alternatives.
  The CaringBridge research agent couldn't reach Reddit, so the user-sentiment findings in `docs/research/caringbridge.md` come from app stores, review sites, and forums. Worth 20 minutes before the post-MVP features are specced.
- **2026-10-12** — Give `/` a simple page.
  The site root shows "Not found" because the spec only defines family addresses. A one-line page naming the app would reassure a stray visitor, without listing or linking any family.
- **2026-10-12** — Switch database URLs to `sslmode=verify-full`.
  `pg` warns that `sslmode=require` will mean weaker checking in its next major version. Today it already behaves as `verify-full`; saying so explicitly in the Vercel and local connection strings silences the warning and keeps the behavior after upgrades.
- **2026-10-13** — Give schema-changing PRs their own preview database if the shared one keeps colliding.
  All previews share the schema-only `preview` branch, which breaks when two open PRs change the schema or a PR's migration is abandoned; the fix today is recreating `preview` by hand (README → Deployment). If that happens often, script a schema-only Neon branch per PR with a branch-scoped Vercel variable and cleanup on merge.
- **2026-10-15** — Prune anonymous supporter records with no live sessions.
  Each correct answer creates a record, so they pile up, one per device per answer. They're never listed, but their reactions stay counted (unnamed) after the reader is signed out, for example by an answer change; pruning a record cascades to its reactions.
- **2026-10-15** — Add dark mode.
  The shadcn theme in `src/index.css` already defines dark colors; turning them on (following the system setting) mostly means checking every page in both modes. Cut from the Geist restyle for speed.
