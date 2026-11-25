# Next Session

Deferred ideas and follow-ups, highest priority first. Claude maintains this list; see "The next-session backlog" in `CLAUDE.md`.

## Views (next features, in order)

Decided with Melissa for her own family's site; each becomes its own spec, plan, and PR after group management ships. The existing family's site keeps its community question and sees none of this.

- **2026-11-24** — Follow-ups cut from non-admin family members.
  No record of who changed someone's admin status; non-admins aren't shown who the admins are; the operator's `family:create` script makes every member an admin without asking; the preview seed has no non-admin family member (Melissa makes one with the add form). Add whichever real use shows to be missing.
- **2026-11-24** — Tidy the invite-request flow after seeing it used.
  Cut for speed when "Request an invite" shipped: choosing groups while approving (today the family adds them afterward in Groups), a navigation-bar badge for pending requests (today only the email and the People page tell them), bulk decline, and batching the "someone asked to join" email. Add whichever real use shows to be missing.
- **2026-11-24** — When a family creates its first group, offer to re-audience its existing posts.
  Melissa's idea while deciding per-group notes: choose to leave all earlier posts as Everyone, share them with the new group, or make them Family members only. It rewrites every post's audience in bulk, and a video update can't be edited (see `spec/updates.md`), so decide how videos are handled and whether the change is undoable. Until it exists, creating a group leaves earlier posts as Everyone.
- **2026-11-24** — Follow-ups cut from notes and reactions per group.
  A note's audience can't be changed after it's left; supporters aren't told who sees their notes; no admin preview of who sees what; family notes can't be aimed at individual groups; the reader's peer set is loaded on every notes or reactions request, so revisit it if feed polling shows load. Add whichever real use shows to be missing.
- **2026-11-24** — Public updates, readable without signing in.
  Melissa wants some posts public. It breaks "shown only to people signed in," so settle before specifying: "Public" is a deliberate choice, never a default, and can't be undone once copied; anonymous readers see the update only, with no notes, reactions, or names; what the signed-out page shows beside the gate or request form; photos and videos served to anonymous readers through a check that the update is public; banner wording that doesn't call it private; pages stay `noindex`. Do it after per-group notes and before Views.
- **2026-11-23** — Views: a name, branding, and domain per group.
  A View is a group with its own front door: name, accent color, maybe a logo, and an optional custom domain. On a View's domain a reader sees only updates shared with that View's group, and emails link to that domain under that name. The domain only narrows what's shown and never grants access. Decide whether updates shared with Everyone show on every View. Family members post from an admin domain that also serves the family's own View to close relatives and friends. Each domain is added in Vercel by hand and attached with an operator script; real domains never go in the repo. Don't attach the admin domain to the Vercel project before this ships: `ROOT_FAMILY_SLUG` would show the existing family at its root. If its DNS goes through Cloudflare, keep records DNS-only so no proxy decrypts the app's traffic.

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

- **2026-11-23** — Help group members get signed in by email.
  Group membership follows a supporter's record, so someone who only answered the question on a device sees just "Everyone" updates there until they sign in by email. A "you've been added" email with a sign-in link, or a prompt on the feed, would save the family explaining it. Came up while speccing groups.
- **2026-10-17** — Let a family member change a video update's post settings.
  Video updates can't be edited, so their reactions, "Allow notes," and audience stay as posted. A settings-only edit would fix a regretted choice without deleting and reposting, which loses notes and re-sends emails.
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
- **2026-11-23** — Keep the "new updates" button off the privacy banner on phones.
  At 360px the floating "1 new update" pill sits over the banner's text at the top of the page. Seen while checking group audiences in the browser.
- **2026-11-23** — Bring an update that newly comes into a reader's audience to their attention.
  Widening an older update's audience counts it in "new updates," but it appears at its original date below newer ones, where the button doesn't scroll. Accepted in the groups plan.
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
