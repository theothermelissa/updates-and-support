# Implementation plan: invite-only families

Bridges `spec/access.md` → "Invite-only families" (and the invite-only parts of `spec/updates.md` → "Audience") and the current code. One PR.

An invite-only family has no community question. Its signed-out page offers only "sign in with your email," family members add supporters directly (their welcome email carries a one-step, 7-day sign-in link), and the post form always offers Everyone, Family members only, and groups. Families that aren't invite-only, including the existing production family, behave exactly as today.

## Decisions

- **`Family.inviteOnly`**, a boolean set only by `family:create`. No script or page changes it, so nothing has to convert a family's existing readers or updates.
- **No new access concept.** "Family members only" is the existing representation: `audience = groups` with no `UpdateGroup` rows. `visibleUpdates`, `canSeeUpdate`, and notifications already treat it as family members only. The only new thing is that an invite-only family may *choose* it, as the audience input `"family"`.
- **Every refusal is an explicit `inviteOnly` check in `server/`**, not a side effect of an empty answer list, so each one can be tested and proven by removing it.
- **The welcome link is a normal `sign_in` magic link with a 7-day lifetime.** `signInWithLink` already spends it once, starts a session, and marks the email verified; removal already deletes unused links.

## Cut for speed

- The "Request an invite" form, the requests list, and admin emails are the next PR.
- No database check tying `inviteOnly` to an empty answer list. The server checks are what's tested, and a constraint would make them impossible to prove by removal.
- An invite-only family's `question` stays an empty string, not a nullable column, to avoid touching every reader of `question`.

## API shapes (fixed, so `src/` and `server/` can be built in parallel)

- `GET /api/f/<slug>/gate` → `{ displayName, slug, home, inviteOnly: boolean, question?: string }`. `question` is absent when `inviteOnly`.
- `POST /api/f/<slug>/gate` on an invite-only family → `403 { error: "This family is invite-only." }`. Nothing is recorded.
- `POST /api/f/<slug>/question` on an invite-only family → `403 { error: "This family is invite-only." }`.
- `POST /api/f/<slug>/auth/verify`: the confirm step's response `canSignIn` is `false` on an invite-only family, and the answer step returns `{ result: "invalid" }` there.
- `GET /api/f/<slug>/me` → `family.inviteOnly: boolean` added.
- `GET /api/f/<slug>/people` → `inviteOnly: boolean` added. Other fields unchanged.
- `POST /api/f/<slug>/updates` and `PATCH /api/f/<slug>/updates/<id>`: `audience` also accepts `"family"`, only on an invite-only family. Elsewhere it's `400 { error: 'Expected audience to be "everyone" or { groups }' }`, as any unknown value is today. The feed's `audience` view for a family-only update stays `{ groups: [] }`.

## Steps

### Server (builder A, main checkout)

1. **Schema.** Add `inviteOnly Boolean @default(false)` to `Family`, with a comment. Hand-write the migration (`claude/lessons.md` → "Commands that fail in an agent's shell"), named to sort after the newest in `prisma/migrations/` and after `origin/main`'s.
2. **`server/families.ts`.**
   - `NewFamily` gains `inviteOnly: boolean`.
   - `createFamily` stores it. An invite-only family gets `question: ""` and `acceptedAnswers: []`, whatever is passed.
   - A family that isn't invite-only must have a non-empty question and at least one answer, or it throws.
3. **`server/gate.ts`.**
   - `gateInfo` returns `inviteOnly`, and `question` only when the family isn't invite-only.
   - `answerGate` throws `RequestError(403, "This family is invite-only.")` first thing for an invite-only family; the handler maps it with `sendRequestError`.
   - `signInWithVerifyLink` returns `{ result: "invalid" }` for an invite-only family, before checking the link or answer.
4. **`server/auth.ts`.**
   - `verifyEmail` returns `canSignIn: false` when the link's family is invite-only. `findUsableLink` already loads the family; keep `inviteOnly` available to `verifyEmail` without widening the returned `person`.
   - `newSignInLink(lifetime = LINK_LIFETIME)`, and export a `WELCOME_LINK_LIFETIME = 7 * DAY`.
5. **`server/people.ts`.**
   - `changeQuestion` throws 403 on an invite-only family. It loads the family first, under the existing lock.
   - `addSupporter`, on an invite-only family, creates a `sign_in` link with `WELCOME_LINK_LIFETIME` instead of a verify link, and sends `invitedEmail` (below) with `signInLinkUrl(...)` and the family's home address. Otherwise it's unchanged.
   - `listPeople` returns `inviteOnly`.
6. **`server/email.ts`.** Add `invitedEmail(to, familyName, { signIn, site })`: "You've been added to {family}. Sign in here: {link}. The link works once and expires in 7 days. After that, you can sign in any time at {site} with your email. If you don't know this family, you can ignore this email." No update content.
7. **`server/audience.ts`.**
   - `AudienceInput` gains `"family"`.
   - `parseAudience(input, { inviteOnly })` accepts `"family"` only when `inviteOnly`; otherwise `"family"` falls through to the existing 400.
   - `writeAudience` treats `"family"` as no groups: delete the rows, set `audience: "groups"`.
   - `audienceColumn` in `server/updates.ts` maps `"family"` to `"groups"`.
8. **`server/updates.ts`.** `createUpdate` and `editUpdate` (and the video path) load the family's `inviteOnly` and pass it to `parseAudience`. `"family"` takes the groups lock like a group audience does. Notifications need no change: `canSeeUpdate` with no group IDs is family members only. Confirm it, and confirm the poster is still excluded.
9. **Handlers.** `api/f/[slug]/me.ts` adds `inviteOnly`. `gate.ts` and `question.ts` route the 403 through `sendRequestError`. Handlers stay thin.
10. **Scripts.**
    - `scripts/create-family.ts` asks "Invite-only? (y/N)" first, and skips the question and answers when yes.
    - `scripts/seed-preview.ts` also upserts a second fictional family, `testinvite-preview`, "The Okafor Family," invite-only, with `PREVIEW_FAMILY_EMAIL` as its family member. Its production guard allows both test slugs.
    - `scripts/sign-in-preview.ts` and `scripts/preview.sh` accept an optional `--invite-only` that targets that family.
    - Update README → Deployment for the flag.

### Frontend (builder B, worktree)

11. **`src/pages/Gate.tsx`.** When `inviteOnly`, show the display name, "This site is private. If you've been invited, sign in with your email.", and an email box with "Send me a sign-in link," posting to the existing `auth/request-link`. It then shows "Check your email." There's no question, no "Family sign-in" split, and no "Already joined?" link.
12. **`src/pages/Verify.tsx`.** Confirm that `canSignIn: false` already shows the "Sign in by email" route, and that it lands on the signed-out page for an invite-only family.
13. **`src/components/postSettings.tsx`** (and the edit form). When `family.inviteOnly`:
    - "Who can see this" always shows, with Everyone (default), Family members only, and Only these groups (only when groups exist).
    - Family members only sends `audience: "family"`, shows the padlock, is announced as "Family members only," and the email checkbox reads "Notify family members by email."
    - Editing a family-only update preselects it.
    - Non-invite-only families render exactly as today.
14. **`src/pages/People.tsx`.** When `inviteOnly`, hide the community-question section and the "Signed in without a verified email" line. The supporter removal confirmation drops the sentence about changing the answer. The add-supporter form's note says they'll get an email with a link to sign in.

### Verification (builder C, independent, after A and B)

15. Audit every caller of `parseAudience`, `writeAudience`, `gateInfo`, `answerGate`, `changeQuestion`, and `addSupporter` for a missed `inviteOnly` path. Re-run the mutation proofs below. Do a browser check of both families at 360px and desktop: the invite-only gate, the post form with no groups and with groups, a family-only post that a supporter in a group can't see, the People page, and the existing family's gate and post form unchanged.

## Tests

Integration tests against real Postgres. Each access test is proven by removing its rule and watching it fail. Fixtures give the invite-only family a non-empty `acceptedAnswers` where needed, so a removed check is actually reached; see `claude/lessons.md` → "Patterns that hide a removed access rule."

1. **Gate refused.** `answerGate` on an invite-only family whose fixture has accepted answers, given a matching answer, throws 403 and creates no person or session.
2. **Confirmation page can't sign in.** On an invite-only family, `verifyEmail` returns `canSignIn: false`, and `signInWithVerifyLink` with a valid verify link and matching answer returns `invalid` and creates no session.
3. **Question can't be set.** `changeQuestion` on an invite-only family is refused and leaves the family's question and answers unchanged.
4. **Welcome link.** On an invite-only family, `addSupporter` stores one `sign_in` link expiring about 7 days out, and no verify link. Spending it with `signInWithLink` starts a session and marks the email verified, and a second spend fails. Removing the supporter deletes the unused link (assert the row, not just a failed sign-in). On a regular family, `addSupporter` still stores a verify link (regression).
5. **Family members only.**
   - On an invite-only family, an update posted with `audience: "family"` is in a family member's `listUpdates` and absent from the feed of a verified supporter who belongs to every group. A request naming it gets 404 for that supporter.
   - It notifies family members (not the poster) and no supporter.
   - Editing an everyone update to `"family"` hides it from that supporter.
6. **"family" refused elsewhere.** On a regular family, `createUpdate` and `editUpdate` with `audience: "family"` return 400 and change nothing.
7. **Gate info.** A unit test that `gateInfo` omits `question` for an invite-only family and includes it otherwise.
8. **`createFamily`.** A unit or integration test that invite-only discards a passed question and answers, and that a regular family without answers is refused.

Run `npm run typecheck` and `npm test` before every push.
