# Next Session

Deferred ideas and follow-ups, highest priority first. Claude maintains this list; see "The next-session backlog" in `CLAUDE.md`.

## Privacy and security

- **2026-10-15** — Decide whether to remove a real family's names from `main`'s history.
  A rename PR committed a real person's name, the family's surname, and their address to this public repo. They're gone from the files now, but one commit message on `main` still has the name, and the earlier file versions remain in history. Removing them means rewriting `main` and force-pushing, which is Melissa's call; forks, clones, and GitHub's cached views may keep copies regardless.
- **2026-10-15** — When the answer changes, also sign out sessions that predate a supporter's own email confirmation.
  Someone who knows the answer can give the email of a real person not yet on the list; if that person confirms it, the device that gave it becomes a verified supporter that survives answer changes (Stated limits in `spec/access.md`), which defeats the family's main lever against someone they want out. Signing those devices out at confirmation was rejected because real supporters often confirm in a different browser (a mail app's built-in one) and would be signed out of the first. Instead, an answer change could also sign out sessions created by answering the gate before the owner confirmed the email. It needs a schema change (which sessions came from the gate, and who verified the email), and must keep sessions the family verified with the People page's Verify button signed in.
- **2026-10-16** — Give this app its own Cloudinary environment and check its credit use.
  The app shares Melissa's free-plan environment with her other, inactive projects, so its key can reach their assets, and storage, bandwidth, and conversions share one credit pool. Check usage after launch week, and move to a separate environment if another project becomes active.

## Launch-week watching

- **2026-10-12** — Revisit the gate's per-network limit on shared networks.
  Once a network reaches 30 wrong answers in an hour, every answer from it is refused, correct ones included. So one guesser on hospital or school Wi-Fi can lock out real supporters there for an hour. If that gets reported, consider letting a correct answer through for a browser with no wrong answers of its own.

## Features and fixes

- **2026-10-17** — Let a family member change a video update's post settings.
  Video updates can't be edited, so their reactions and "Allow notes" stay as posted. A settings-only edit would fix a regretted choice.
- **2026-10-15** — Let a supporter change an email they haven't confirmed.
  A typo in the feed's email prompt leaves them without notifications, and the only fix is signing out and answering again. Allow replacing an unverified email, cancelling its old verify link.
- **2026-10-16** — Warn before leaving a page with an unposted update or note.
  Moving between pages is instant, which makes it easy to click away from a half-written update and lose it. Leaving with a draft should ask first (on the page, not with `confirm()`).
- **2026-10-16** — Let a family member delete all of one author's notes at once.
  A nameless reader who signs notes isn't on the People page, so the only remedies for a flood are deleting notes one by one (capped at 20 an hour per person) or changing the answer.
- **2026-10-16** — Show and edit supporters' phone numbers on the People page.
  The People page lists only supporters with an email, so a phone number given without one shows only beside that supporter's offers. And only the supporter can set their number, though a family member may hear it in person. Both change the same People page table, so they ship together.
- **2026-10-17** — Show family members' notification status on the People page.
  Family members now get new-update emails and can turn them off, but the People page shows notification status only for supporters, so the family can't see that one of them opted out. Cut for speed when family members started getting emails.
- **2026-10-14** — Show People page messages next to the form that caused them.
  "Added Tess…" and add errors appear at the top of the page, out of view of the supporter form further down. Toasts (shadcn's `sonner`) are the natural fix.
- **2026-10-16** — Restore scroll position on Back, and show a light loading state under the nav bar.
  Back lands at the top of the feed rather than where the reader was, and the content area is briefly empty while a page fetches.
- **2026-10-17** — Tidy the How to Help editors.
  Editing the message shows three editors, each with its own full toolbar, beside the request form's own, and nothing warns before a message part or request passes 2,000 characters until Save fails. A shared toolbar and a character count (Tiptap's CharacterCount, already in `@tiptap/extensions`) would fix both.
- **2026-10-16** — Let authors edit their notes.
  Today they delete and leave another. Also in the spec's Later list.
- **2026-10-12** — Give `/` a simple page.
  The site root shows "Not found" because the spec only defines family addresses. A one-line page naming the app would reassure a stray visitor, without listing or linking any family.
- **2026-10-15** — Add dark mode.
  The shadcn theme in `src/index.css` already defines dark colors; turning them on (following the system setting) mostly means checking every page in both modes.

## Cleanup and maintenance

- **2026-10-15** — Sweep orphaned Cloudinary uploads.
  Photos: one uploaded but never saved, a destroy that failed after the update was already deleted, or an update deleted while photos were off, stays in Cloudinary with nothing pointing to it; the signed upload fields can also be posted to the raw or video endpoint. Videos: one uploaded but never attached (refused for length or size, or a failed or abandoned note or update) stays unseen. One script can destroy authenticated images under `families/` with no `Photo` row, and ticketed video public IDs with no note and no update after a day. Photos and video notes delete differently on purpose: videos are destroyed before the row is removed and the request fails if Cloudinary fails; photos are destroyed after the database commit and the request still succeeds.
- **2026-10-15** — Prune anonymous supporter records with no live sessions.
  Each correct answer creates a record, so they pile up, one per device per answer. They're never listed, but their reactions stay counted (unnamed) after the reader is signed out, for example by an answer change; pruning a record cascades to its reactions on updates and on notes.
- **2026-10-12** — Switch database URLs to `sslmode=verify-full`.
  `pg` warns that `sslmode=require` will mean weaker checking in its next major version. Today it already behaves as `verify-full`; saying so explicitly in the Vercel and local connection strings silences the warning and keeps the behavior after upgrades.
- **2026-10-16** — Backfill `Update.content`, then drop `body` and `{ body }` requests.
  Updates from before formatting have no content and are converted from `body` each time the feed loads, and `body` is kept in step so older code still works during a deploy or rollback. Once formatting has been live a while, backfill `content` with `docFromText`, make it required, and remove the `body` fallbacks; the wall's excerpts would then need `textOf`.
- **2026-10-13** — Give schema-changing PRs their own preview database if the shared one keeps colliding.
  All previews share the schema-only `preview` branch, which breaks when two open PRs change the schema or a PR's migration is abandoned; the fix today is recreating `preview` by hand (README → Deployment). If that happens often, script a schema-only Neon branch per PR with a branch-scoped Vercel variable and cleanup on merge.

## Research

- **2026-10-12** — Run a manual Reddit search on CaringBridge and alternatives.
  The CaringBridge research agent couldn't reach Reddit, so the user-sentiment findings in `docs/research/caringbridge.md` come from app stores, review sites, and forums. Worth 20 minutes before the post-MVP features are specced.
