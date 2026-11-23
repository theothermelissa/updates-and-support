# Implementation plan: invite-only families

Bridges `spec/access.md` → "Invite-only families" (and the invite-only parts of `spec/updates.md` → "Audience") and the current code. One PR.

An invite-only family has no community question. Its signed-out page offers only "sign in with your email," family members add supporters directly (their welcome email carries a one-step, 7-day sign-in link), and the post form always offers Everyone, Family members only, and groups. Families that aren't invite-only, including the existing production family, behave exactly as today.

## Decisions

- **`Family.inviteOnly`**, a boolean set only by `family:create`. No script or page changes it, so nothing has to convert a family's existing readers or updates. Because it never changes, reading it once per request, outside any lock, is enough.
- **No new access concept.** "Family members only" is the existing representation: `audience = groups` with no `UpdateGroup` rows. `visibleUpdates`, `canSeeUpdate`, notes, reactions, the wall, and group deletion's `sharedOnlyWith` already treat it as family members only. The only new thing is that an invite-only family may *choose* it, as the audience input `"family"`.
- **An invite-only family must always name the audience when posting.** A missing `audience` is a 400 there, not Everyone, so a front-end slip fails loudly instead of widening an update.
- **Every refusal is an explicit `inviteOnly` check in `server/`**, not a side effect of an empty answer list, so each one can be tested and proven by removing it.
- **The welcome link is a normal `sign_in` magic link with a 7-day lifetime.** `signInWithLink` already spends it once, starts a session, and marks the email verified; removal already deletes unused links; `SignIn.tsx` spends a link only when its button is pressed, so email scanners can't use it up.

## Cut for speed

- The "Request an invite" form, the requests list, and admin emails are the next PR.
- No database check tying `inviteOnly` to an empty answer list. The server checks are what's tested, and a constraint would make them impossible to prove by removal.
- An invite-only family's `question` stays an empty string, not a nullable column, to avoid touching every reader of `question`.

## API shapes (fixed, so `src/` and `server/` can be built in parallel)

- `GET /api/f/<slug>/gate` → `{ displayName, slug, home, inviteOnly: boolean, question?: string }`. `question` is absent when `inviteOnly`.
- `POST /api/f/<slug>/gate` on an invite-only family → `403 { error: "This family is invite-only." }`. Nothing is recorded.
- `POST /api/f/<slug>/question` on an invite-only family → `403 { error: "This family is invite-only." }`.
- `POST /api/f/<slug>/auth/verify`: confirming is unchanged. The answer step on an invite-only family gives the existing `400 { error: "This link has expired or was already used." }`.
- `GET /api/f/<slug>/me` → `family.inviteOnly: boolean` added.
- `POST /api/f/<slug>/updates`:
  - `audience` also accepts `"family"`, only on an invite-only family. Elsewhere it's `400 { error: 'Expected audience to be "everyone" or { groups }' }`, as any unknown value is today.
  - On an invite-only family a missing `audience` is `400 { error: "Choose who can see this update." }`.
- `PATCH /api/f/<slug>/updates/<id>` accepts `"family"` on the same terms. A missing `audience` still keeps the update's audience. The feed's `audience` view for a family-only update stays `{ groups: [] }`.

## Steps

### Server (builder A, main checkout)

1. **Schema.** Add `inviteOnly Boolean @default(false)` to `Family`, with a comment. Hand-write the migration (`claude/lessons.md` → "Commands that fail in an agent's shell"), named to sort after the newest in `prisma/migrations/` and after `origin/main`'s.
2. **`server/families.ts`.**
   - `NewFamily` gains an optional `inviteOnly?: boolean`, default false, so existing callers and fixtures compile unchanged.
   - `createFamily` stores it. An invite-only family gets `question: ""` and `acceptedAnswers: []`, whatever is passed.
   - A family that isn't invite-only must have a non-empty question and at least one answer, or it throws.
3. **`server/gate.ts`.**
   - `gateInfo` returns `inviteOnly`, and `question` only when the family isn't invite-only.
   - `answerGate` throws `RequestError(403, "This family is invite-only.")` first thing for an invite-only family.
   - `signInWithVerifyLink` returns `{ result: "invalid" }` for an invite-only family as its first step, before checking the link or answer.
4. **`server/auth.ts`.** `newSignInLink(lifetime = LINK_LIFETIME)`, and export `WELCOME_LINK_LIFETIME = 7 * DAY`. `verifyEmail` is unchanged: the confirmation page reads `inviteOnly` from `gate`.
5. **`server/people.ts`.**
   - `changeQuestion` reads the family first, before validating input, and throws `RequestError(403, "This family is invite-only.")` for an invite-only family.
   - `addSupporter`, on an invite-only family, creates a `sign_in` link with `WELCOME_LINK_LIFETIME` instead of a verify link. It sends `invitedEmail` (below) with `signInLinkUrl(...)` and the family's home address (`appUrl()` + `familyHomePath(slug)`). Otherwise it's unchanged.
6. **`server/email.ts`.** Add `invitedEmail(to, familyName, { signIn, site })`: "You've been added to {family}. Sign in here: {link}. The link works once and expires in 7 days. After that, you can sign in any time at {site} with your email. If you don't know this family, you can ignore this email." No update content.
7. **`server/audience.ts`.**
   - `AudienceInput` gains `"family"`.
   - `parseAudience(input, { inviteOnly })` accepts `"family"` only when `inviteOnly`; otherwise `"family"` falls through to the existing 400.
   - `writeAudience` treats `"family"` as no groups: delete the rows, set `audience: "groups"`.
8. **`server/updates.ts`.**
   - `createUpdate` and `editUpdate` read the family's `inviteOnly` and pass it to `parseAudience`.
   - `createUpdate` refuses a missing audience on an invite-only family (400, above) instead of defaulting to Everyone.
   - `audienceColumn` maps `"family"` to `"groups"`.
   - The video path receives the already-parsed audience. The existing `audience !== "everyone"` checks already take the groups lock for `"family"`.
   - Notifications need no change: `canSeeUpdate` with no group IDs is family members only, and the poster is excluded as before.
9. **Handlers.** `api/f/[slug]/me.ts` adds `inviteOnly`. `api/f/[slug]/gate.ts` gets a try/catch with `sendRequestError` around `answerGate`; `question.ts` already routes `RequestError`s. Handlers stay thin.
10. **Scripts.**
    - `scripts/create-family.ts` asks "Invite-only? (y/N)" first, and skips the question and answers when yes.
    - `scripts/seed-preview.ts` also upserts a second fictional family, `testinvite-preview`, "The Okafor Family," invite-only, with `PREVIEW_FAMILY_EMAIL` as its family member.
    - Both production guards (`seed-preview.ts` and `sign-in-preview.ts`) allow both test slugs.
    - `sign-in-preview.ts` and `scripts/preview.sh` accept an optional `--invite-only` that targets the Okafor family.
    - Update README → Deployment.
    - Older checkouts' `preview:sign-in` refuses once the preview database holds the second family, until they merge `main`. There are no other open PRs today; say so in the PR.
    - `unverifiedSupporters` (`server/notifications.ts`, used by `scripts/send-verifications.ts`) skips invite-only families, whose supporters can't use a verify link.

### Frontend (builder B, worktree)

11. **`src/audience.ts`.**
    - `audienceBody` returns `"family"` for `mode: "family"`, so a family-only choice is sent on create and on edit, through `changedAudience`.
    - Update the `AudienceChoice` and `audienceBody` comments.
    - On regular families, `"family"` is still only the current audience of an update whose group was deleted. Editing such an update without changing its audience sends nothing, as today, because `changedAudience` sees no change.
    - Update the request body types in `src/pages/Feed.tsx` to match.
12. **`src/pages/Gate.tsx`.** When `inviteOnly`, show the display name, "This site is private. If you've been invited, sign in with your email.", and an email box with "Send me a sign-in link," posting to the existing `auth/request-link`. It then shows "Check your email." There's no question, no "Family sign-in" split, and no "Already joined?" link.
13. **`src/pages/Verify.tsx`.** When `gate` says `inviteOnly`, after confirming never show the question. Link to the family's signed-out page (`gate.home`) instead of `/f/<slug>/family`.
14. **`src/components/postSettings.tsx`** (and the edit form). When `family.inviteOnly`:
    - "Who can see this" always shows, with Everyone (default), Family members only, and Only these groups (only when groups exist).
    - Family members only shows the padlock, is announced as "Family members only," and the email checkbox reads "Notify family members by email."
    - Editing a family-only update preselects it.
    - Non-invite-only families render exactly as today.
15. **`src/pages/People.tsx`.** When `me.family.inviteOnly`, hide the community-question section and the "Signed in without a verified email" line. The supporter removal confirmation drops the sentence about changing the answer. The add-supporter form's note says they'll get an email with a link to sign in.

### Verification (builder C, independent, after A and B)

16. Re-run the mutation proofs below. Do a browser check of both families at 360px and desktop:
    - the invite-only gate;
    - the post form with no groups and with groups;
    - a family-only post that a supporter in a group can't see, including after an edit from Everyone to Family members only;
    - the People page;
    - the existing family's gate, post form, and group-deleted family-only edit, unchanged.

## Tests

Integration tests against real Postgres. Each access test is proven by removing its rule and watching it fail. Every refusal test sends otherwise-valid input and asserts the exact status and message, so it reaches the rule; see `claude/lessons.md` → "Patterns that hide a removed access rule."

**Fixtures.** An invite-only family is made with `createFamily({ inviteOnly: true })`. Tests that must reach a check behind the answers then set `acceptedAnswers: ["Biscuit"]` with `db.family.update`, since `createFamily` discards them. A verify link for a supporter there is created directly with `newVerificationLink()` and `db.magicLink.create`.

1. **Gate refused.** `answerGate` on an invite-only family with accepted answers, given the matching answer, throws 403 "This family is invite-only." and creates no person or session.
2. **The confirmation page can't sign in.** On an invite-only family with accepted answers, `signInWithVerifyLink` with a valid, unused verify link for an active supporter and the matching answer returns `invalid`, creates no session, and leaves the link unused.
3. **Question can't be set.** `changeQuestion` on an invite-only family, with a valid question and answers, throws 403 "This family is invite-only." and leaves the family's question and answers unchanged.
4. **Welcome link.**
   - On an invite-only family, `addSupporter` stores one `sign_in` link expiring about 7 days out, and no verify link.
   - Spending it with `signInWithLink` starts a session and marks the email verified, and a second spend fails.
   - Removing the supporter before it's used deletes the link (assert the row, not just a failed sign-in).
   - On a regular family, `addSupporter` still stores a verify link (regression).
5. **Family members only.** On an invite-only family, with a verified supporter who belongs to every group:
   - An update posted with `audience: "family"` is in a family member's `listUpdates` and absent from that supporter's.
   - `addReaction` and `createNote` on it give that supporter 404.
   - It notifies family members (not the poster) and no supporter.
   - Editing an Everyone update to `"family"` hides it from that supporter.
6. **Missing audience refused.** On an invite-only family, `createUpdate` with valid content and no `audience` returns 400 "Choose who can see this update." and creates no update.
7. **"family" refused elsewhere.** On a regular family, with valid content, no `reactions`, and (for edits) a real update ID, `createUpdate` and `editUpdate` with `audience: "family"` return 400 `Expected audience to be "everyone" or { groups }`. Nothing is created, and the edited update's row is unchanged.
8. **Gate info.** A unit test that `gateInfo` omits `question` for an invite-only family and includes it otherwise.
9. **`createFamily`.** Invite-only discards a passed question and answers, and a regular family without answers is refused.

Run `npm run typecheck` and `npm test` before every push.

## Discoveries

- **Server steps 1–10 are built.** The migration is `prisma/migrations/20261030000000_invite_only` (after `main`'s newest, `20261029000000_audience_no_default`), and a fresh database migrated with it shows no drift from the schema.
- **`family:create` now asks "Invite-only?" before the display name**, so answers piped into it need a leading line (blank or `n` for a family with a question).
- **`verifyEmail` is unchanged, so it can return `canSignIn: true`** for an invite-only family's supporter holding an unused verify link. `addSupporter` and `send-verifications` no longer make such links there, but the confirmation page must still decide from `gate.inviteOnly`, not `canSignIn`, as step 13 says; the server refuses the answer step regardless.
- **`unverifiedSupporters` skipping invite-only families has its own test** in `tests/integration/notifications.test.ts`, beyond Tests 1–9.
- **Mutation proofs.** Each rule below was removed and its test failed, then the rule was restored: `answerGate`'s refusal; `signInWithVerifyLink`'s refusal; `changeQuestion`'s refusal; `parseAudience` accepting `"family"` only when invite-only; the missing-audience refusal; `addSupporter`'s sign-in link, its 7-day lifetime, and the regular family's verify link; family members only stored as Everyone (on create, edit, reactions and notes, and notifications); `gateInfo` omitting the question; `createFamily` discarding and requiring answers; removal deleting the unused welcome link; and `unverifiedSupporters` skipping invite-only families.
