# Implementation Plan — Family members add supporters

Implements "Added by a family member" and "Confirming an email" in `spec/access.md`. One session, one PR, no schema change.

## Design

The welcome email reuses the existing **verify** link (purpose `verify`, 7 days). The confirmation page gains a second step for people who aren't signed in: answer the community question to sign in. Verification emails from the gate share the same page and therefore the same behavior.

A verify link becomes two operations:

- **Confirm** marks the email verified *without* spending the link. It is safe to repeat.
- **Sign in** spends the link, but only after a correct answer and only for an active supporter. It works once.

## Steps

1. **`server/auth.ts`**
   - Split `spendLink` into `findUsableLink(tx, slug, token, purpose, { allowUsed })` (all refusals, no write) and the conditional spend.
   - `verifyEmail(db, slug, token)`: `findUsableLink` with `allowUsed`, then mark the email verified, so confirming works for the link's full 7 days. Returns `{ ok: false }` or `{ ok: true, canSignIn }`. `canSignIn` is true when the link is unused and its person is an active supporter, and it tells the page whether to show the question. Only the token holder learns it.
   - New `signInWithVerifyLink(db, family, client, token, answer)`:
     1. Find a usable verify link whose person is an active **supporter**. If there isn't one, return `"invalid"` before any answer is counted.
     2. Run the gate's `checkAnswer` under the same wrong-answer limits, returning `"wrong"` or `"limited"`.
     3. On a correct answer, in one transaction:
        - Lock the person's row with `SELECT ... FOR UPDATE` and re-check `role = 'supporter' AND removedAt IS NULL`.
        - Spend the link (conditional update, so it works once).
        - Create a supporter session and mark the email verified.

        The lock makes promotion and removal wait for this transaction. Without it, a promotion could commit between the role check and the session insert, and its `session.deleteMany` would miss the new session. `getSession` would then grant a family-member session obtained via the question.
   - Returns `{ result: "invalid" | "wrong" | "limited" }` or `{ result: "signed-in", sessionToken }`.
2. **`server/gate.ts`**: export `checkAnswer`.
3. **`server/email.ts`**
   - Add `welcomeEmail(to, familyName, link)`: "{family} added you to their updates. Confirm your email to get an email when they post." No update content.
   - Change the "works once" wording in `verificationEmail` to "expires in 7 days".
4. **`server/people.ts`**: add `addSupporter(db, send, person, { name, email })`.
   - Callable by family members only.
   - Uses `validNameAndEmail`, then branches on the existing person:
     - Active supporter: 409 "already a supporter".
     - Removed supporter: 409 "was removed; restore them from the removed list".
     - Family member, current or removed: 409 "belongs to a family member".
     - No one: create an unverified supporter with notifications on and a verify link, then send the welcome email. A send failure is logged and not thrown.
   - Treats `P2002` as a generic 409, "That email is already in this family."
5. **API**
   - New `api/f/[slug]/supporters.ts` (POST) calls `addSupporter`. It is a separate file so `people/index.ts` keeps meaning "family members".
   - `auth/verify.ts`:
     - `{ token }` confirms, returning `{ ok, canSignIn }`. The page learns whether it's signed in from the existing `GET me`, so the verify endpoint stays scoped to the token.
     - `{ token, answer }` calls `signInWithVerifyLink` and sets the supporter session cookie on success. The handler comment changes, since a verify link can now sign in with an answer.
6. **UI**
   - `Verify.tsx`: after confirming, show "Thanks for confirming your email."
     - If signed in, add a "Go to the updates" button.
     - If not and `canSignIn`, show the community question (from `GET gate`) and an answer box. Correct: go to `/f/<slug>`. Wrong: "That's not the answer." Limited: the gate's message. Invalid (for example, removed in the meantime): the existing "sign in by email" message.
     - If not and not `canSignIn`, show the "sign in by email" link.
     - A signed-in browser never sees the question. If one posts an answer anyway, its session cookie for this family is replaced, which is harmless.
   - `People.tsx`: an "Add a supporter" form (name, email, "Double-check the email before adding."), placed above the supporter list. On success it shows "Added {name}. They'll get an email to confirm."

## Tests (integration, real Postgres)

New tests in `tests/integration/people.test.ts`:

- `addSupporter` refuses a supporter (403). The person is created in the caller's own family. Family A's session at family B's address gets 401.
- Each existing-email case returns its 409 and changes nothing. A new email creates an unverified supporter with notifications on and sends one welcome email whose link points to `/verify#token=`.

New tests in `tests/integration/verify.test.ts`:

- Confirm marks the email verified, leaves the link unspent, and can be repeated.
- A correct answer with a valid link signs in once; a second attempt returns `"invalid"`.
- A wrong answer does not sign in and counts toward the browser limit. At the limit, even the correct answer is refused.
- An invalid, expired, or other-family token, or a `sign_in`-purpose token, returns `"invalid"` and records no attempt.
- Confirming still works after the link has signed someone in, and then returns `canSignIn: false`.
- The network limit applies too.
- Links from the one-time `sendVerifications` send behave the same way, and removal deletes them.
- **A link whose person has been promoted to family member does not sign in.** This blocks a family-member session obtained via the community question.
- **Sign-in racing promotion, repeated 20 times with `Promise.all`:** no family-member session ever survives that didn't come from promotion's own magic link.
- A link whose person has been removed does not sign in.

Every new access test gets the "prove it can fail" check: remove the rule it guards and confirm the test fails.

A handler-level check: a bad token with an answer sets no cookie, and a good one sets the supporter-lifetime cookie.

Existing tests that assert "verify spends the link" or "works once" change to match the spec.

## Cut for speed

- `signInWithLink` has the same promotion and removal race. It isn't exploitable the same way, because the link goes to the person's own inbox, but the locking helper could be applied there later.

- No limit on how many supporters a family member can add.
- No bulk add.
- No resend-welcome button. A supporter who loses the email can use "Sign in by email" on the gate.

## Progress and discoveries

All steps are implemented, and `npm run typecheck` and `npm test` pass (101 tests).

**Proving the tests can fail.** Each access rule was removed in turn to confirm a test catches it:
- the supporter-role checks
- the row lock (caught by the 20-times promotion race)
- the answer check
- checking the link before the answer
- the family-member check in `addSupporter`
- the "already a family member" refusal

The first draft of the "unusable link" test used the correct answer, which never records an attempt, so it passed even with the order reversed. It now uses wrong answers.

**Removal race.** The removal race test passes even without the lock, because removal's cleanup and `getSession`'s removed check cover it. It stays as a regression guard.

**Handler-level checks.** These were verified by hand in the browser on `vercel dev` rather than with a test, since no handler tests exist yet. The full flow was checked:
- add a supporter
- welcome email logged
- confirm while signed out
- a wrong answer is refused
- the correct answer reaches the feed as the supporter
- confirming again while signed in shows "Go to the updates"

Melissa verified the full flow on the PR preview, and the PR was merged.
