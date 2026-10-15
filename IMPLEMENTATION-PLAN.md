# Implementation Plan — Family members verify a supporter's email

Implements "verify" under "Managing supporters" in `spec/access.md`, and the Stated limit on vouched-for emails. One session, one PR, no schema change, no new endpoint file.

## Design

Verifying sets `emailVerifiedAt` on an active supporter's record. Everything that keys on a verified email already reads that column (notifications, the "devices without a verified email" count, signing out on an answer change, the People page's "Verified" column, the feed's "Emails start once you confirm" note), so nothing else changes.

It rides on the existing `PATCH /api/f/<slug>/people/<id>` endpoint, which already means "a family member changes a person's status." The body is `{ verified: true }` instead of `{ removed }`.

**Sessions are left alone.** Verifying signs no one out, by decision: the supporters this is for would otherwise land in the emailed sign-in flow they couldn't manage in the first place.

**Outstanding confirmation links are left alone.** After a family member verifies, the supporter's 7-day confirmation link still works: confirming again is a no-op (`markVerified` returns early), and if the link is unused, it can still sign in on a new device with the community question, as the supporter it was sent to. That is exactly what the link could do before, so verifying grants it nothing new, and the elderly supporter who presses it later still gets "Thanks for confirming." Cancelling it would add code and only make that later press fail.

**No lock.** Verification creates no session, so a race with removal or promotion can't leak access. The update's `WHERE` re-checks role, removal, and family, and Postgres re-evaluates it against a concurrently committed row, so a supporter removed or promoted a moment earlier isn't touched.

## Steps

1. **`server/people.ts`**: add `verifySupporter(db, person, id, verified)`. The one conditional update is the only place the rules live, so each can be proven by removing it once.
   - `requireFamilyMember(person)`: 403 for supporters.
   - `verified !== true`: 400 "Expected verified: true".
   - `updateMany` where `{ id, familyId: person.familyId, role: "supporter", email: { not: null }, removedAt: null, emailVerifiedAt: null }`, setting `emailVerifiedAt: new Date()`. One row changed: done.
   - No row changed: one `findFirst({ id, familyId: person.familyId, role: "supporter", email: { not: null } })` only picks the response:
     - not found: 404 "Person not found". That covers another family's people, family members, and readers with no email, matching `setRemoved`'s rule that another family's people behave like IDs that don't exist.
     - removed: 409 "That supporter was removed. Restore them first."
     - already verified, including by a concurrent request: return without error (no-op).
2. **`api/f/[slug]/people/[id].ts`**: a body with both `removed` and `verified` gets 400. With `verified`, call `verifySupporter`; otherwise `setRemoved` as now. Update the handler comment.
3. **`src/pages/People.tsx`**
   - `verify(s)`: `PATCH people/<id>` with `{ verified: true }`. On success, message "Verified {name}'s email." and reload; on error, the server's message.
   - `SupporterTable` gets an optional `onVerify`. When it's given and the row is unverified, the Verified cell shows "Not yet" and a "Verify" button. Only the active supporters table passes `onVerify`.
   - The pending confirmation becomes `{ id, kind: "action" | "verify" }` instead of a bare row ID, so the confirmation row shows the text, "Yes" button, and handler of the button that opened it. Pressing one button replaces the other's pending confirmation.
   - Verify's inline confirmation (not `confirm()`; see `claude/lessons.md`): "Verify only if {name} told you {email} is their email. They'll get update emails without confirming." with "Yes, verify" and "Cancel".
4. **`prisma/schema.prisma`**: the `emailVerifiedAt` comment becomes "Set when the person confirms their email, signs in by magic link, or a family member verifies it." A comment-only edit, so no migration.
5. **`NEXT-SESSION.md`**
   - Remove "Decide how a family can help a supporter whose email is stuck at 'Not yet'."
   - In "End a supporter's other sessions when their email is first verified," add that a family member's verification deliberately signs no one out, so that fix applies only to verification by the email's owner.

## Tests (integration, real Postgres)

A new `describe("verifying a supporter's email")` in `tests/integration/people.test.ts`, using the existing Rivera and Okafor fixtures:

Every refusal asserts its exact status, and every target starts unverified, so a removed rule can't hide behind the no-op path.

- **Refused to supporters.** Sam (a supporter) verifying Tess gets 403, and Tess stays unverified.
- **Own family only.** Ana verifying Olu (Okafor's supporter) gets 404, and Olu stays unverified.
- **Only active supporters with an email.** Ana verifying each of these gets its status and changes nothing:
  - a removed supporter whose email is unverified: 409
  - a reader with no email: 404
  - Ben, a second Rivera family member set to unverified: 404
- **Already verified is a no-op.** Verifying again succeeds and leaves `emailVerifiedAt` unchanged.
- **Success.** Ana verifies Sam, who joined through the feed's prompt and has a session:
  - `listPeople` shows him verified.
  - His session still works, which guards the decision not to sign anyone out.
  - His confirmation link still confirms, and `emailVerifiedAt` doesn't move.
- **Bad input.** `verified: "yes"` gets 400.

Each access test gets the "prove it can fail" check. Remove `requireFamilyMember`, the `familyId`, `role`, `email`, and `removedAt` conditions from the update in turn, and confirm a test fails each time. Without the `email` condition, the database's `Person_verified_has_email` check throws instead of the expected 404.

Hand check in the browser on the PR preview:
- the button appears only on unverified, active rows
- Cancel does nothing
- pressing Verify, then Remove on the same row, shows Remove's confirmation, and Cancel closes it
- Yes verifies, and the row flips to "Yes"
- the supporter's feed loses the "Emails start once you confirm" note

## Cut for speed

- **No email to the supporter** saying the family verified them. Their next notification is the signal.
- **No record of who verified, or how.** `emailVerifiedAt` doesn't distinguish confirmed from vouched; the spec's Stated limits says "verified" means either.
- **No "Resend confirmation" button.** Verifying covers the supporters who received the email but couldn't finish; resending is still in the deliverability backlog entry's territory if emails turn out not to arrive.
- **No unverify.** For a wrong verification, the remedy is removing the supporter and changing the answer.
- **No race test.** Verification grants no session, and the conditional update is the guard; a lock and its deterministic race test would cost more than the risk.
- **No handler-level test**, matching the rest of `api/`; the handler is a two-way branch, checked by hand.
