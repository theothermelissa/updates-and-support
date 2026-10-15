# Implementation Plan — Read first, email later

Implements "Joining," "Getting notification emails," "Returning on a new device," "Managing supporters," "Changing the community question," and the session rule "Signing in to a family ends the browser's previous session for that family" in `spec/access.md`. One session, one PR, one small migration.

## Design

### Data model

`Person.name` and `Person.email` become optional. A supporter who has only answered the question is a `Person` with role `supporter` and no name or email. Every other code path keeps working unchanged: their session is an ordinary supporter session, so `getSession`, the feed, and every role check treat them like any other supporter.

```
ALTER TABLE "Person" ALTER COLUMN "name" DROP NOT NULL, ALTER COLUMN "email" DROP NOT NULL;
```

The unique `(familyId, email)` constraint stays. Postgres treats NULLs as distinct, so any number of supporters can have no email. The migration is backward-compatible with the code already running, which always writes both.

### Answering

`answerGate(db, family, client, { answer })` runs as one transaction under the gate's existing per-family lock:

1. Count the browser's and network's wrong answers; at either limit, return `limited`.
2. Read the family's accepted answers **from the database, under the lock**. This replaces the `family` object the caller loaded before the lock.
3. On a wrong answer, record it and return `wrong`.
4. On a correct answer, create the supporter and their 180-day session in one nested create and return `joined`.

There is no longer an answer-only check, and nothing is emailed. Any `name` or `email` in the body is ignored, so a page still cached from before this change still works: its first request, `{ answer }`, now returns `joined`, which it already handles.

### Changing the answers

`changeQuestion` takes the same per-family lock, reads the current answers, saves the new ones, and then, if `dropsAnAnswer(before, after)`, deletes every session of a supporter in this family whose email isn't verified. Family members always have a verified email by the time they have a session, so they are unaffected. The function returns how many sessions it ended, so the page can say so.

`dropsAnAnswer` (pure, in `server/answers.ts`) is true when any old answer, normalized, is missing from the new answers, normalized. Rewording the question, adding an answer, or changing only capitals, spacing, or a leading "the" returns false.

Holding the lock on both sides, and reading the answers under it, closes the race the spec rules out: an answer checked against the old answers either commits before the change (and its session is then deleted) or waits and is checked against the new answers.

### Giving an email

New `addEmail(db, send, family, person, { name, email })` in `server/gate.ts`, for a signed-in supporter with no email:

- Refuse family members and supporters who already have an email (409), and an invalid name or email (400).
- **Email of a removed person:** 403, "This email can't join this family's updates. Please contact the family." Nothing changes.
- **Email of anyone else in the family:** change nothing, send that address a sign-in link through the existing `requestSignInLink` (rate-limited), and return `sign-in-link`.
- **New email:** in one update conditioned on `email: null`, set the name and email and create a verify link; send the verification email, logging rather than throwing on failure; return `verify`.
  - `P2002` (someone took the email a moment ago) is handled as a known email.
  - `P2025` (this supporter's email was set a moment ago, for example by a double submit) is a 409.

### Ending a browser's previous session

New `startSession(db, req, res, slug, token, lifetime)` in `server/http.ts`. It deletes the session in the browser's existing cookie for this family, if any, then sets the new cookie. The gate, `auth/sign-in`, and `auth/verify` use it. When a reader without an email signs in by link as their own record, their anonymous session ends instead of being counted for 180 days.

### People page data

`listPeople` lists only supporters with an email. It adds `devicesWithoutVerifiedEmail`: the count of unexpired sessions belonging to active supporters of this family with no verified email.

## Steps

1. **Schema and migration.** Make `name` and `email` optional; generate the migration with `prisma migrate dev --create-only` and check its SQL is just the two `DROP NOT NULL`s.
2. **Null-safety.** Fix what the type checker flags now that `name` and `email` can be null:
   - `requestSignInLink` sends to the normalized address it looked up.
   - `notifySupporters`, `unverifiedSupporters`, and `sendVerifications` add `email: { not: null }`.
   - `personView` adds the person's own `email`.
   - `listPeople`, `supporterView`, and update author names handle the types.
3. **`server/answers.ts`:** `dropsAnAnswer`, with unit tests.
4. **`server/gate.ts`:** export `lockGate`; `checkAnswer` runs inside a caller's transaction and reads the answers under the lock; rewrite `answerGate`; add `addEmail`. `signInWithVerifyLink` keeps its behavior on the new `checkAnswer`.
5. **`server/people.ts`:** the `changeQuestion` sign-out; `listPeople` filtering and the device count.
6. **`server/email.ts`:** the verification email's text becomes about getting emails when the family posts, rather than about joining.
7. **API:** `gate.ts` drops `sendEmail`; new `email.ts` (POST `{ name, email }`, signed-in only); `startSession` in `gate.ts`, `auth/sign-in.ts`, and `auth/verify.ts`.
8. **UI:**
   - **`Gate.tsx`:** one answer box and "Continue"; a correct answer goes to the feed.
   - **`FamilyHome.tsx`:**
     - "Signed in as" only when the person has a name.
     - For a supporter without an email, a prompt at the top: name, email, "The family will see your name and email," and an "Email me" button.
     - After a new email, the existing "Emails start once you confirm" note.
     - After a known email, "That email is already on the family's list. We've sent it a link to sign in on this device."
   - **`People.tsx`:**
     - The device count under Supporters.
     - The question form's explanation, with the count.
     - "Signed out N devices" after a save that ended sessions.
     - The Remove confirmation: "If they know the answer, they can still read without an email until you change the answer."
     - Empty state: "No supporters have given an email yet."

## Tests

Integration, against real Postgres:

- **Answering** (`gate.test.ts`):
  - A correct answer signs in a new supporter with no name or email, valid only in this family, and records no attempt.
  - A wrong or limited answer creates no person or session.
  - Each correct answer is a separate supporter.
  - The existing limit tests now expect `joined` where they expected `correct`.
  - **Answers are read under the lock:** answering with a `family` object loaded before a change is checked against the new answers.
- **Giving an email** (`gate.test.ts`):
  - **New email:** it goes on the reader's own record, unverified, and one verification email goes to it with a working link.
  - **Email of a supporter or family member:** neither record changes, that address gets a sign-in link that signs in as its owner, and the reader's session still belongs to the reader.
  - An email known only in another family counts as new here.
  - A removed supporter's or family member's email: 403; nothing changes and nothing is sent.
  - Refused (409) for a supporter who already has an email and for a family member; an invalid name or email is a 400.
  - Two readers giving the same new email at once: one gets it, the other gets a sign-in link.
  - The email is still added if the verification email fails.
- **Changing the answers** (`people.test.ts`):
  - **Signs out the right sessions:** removing or changing an answer ends the sessions of anonymous readers and of supporters with an unverified email. Verified supporters, family members, and another family's readers stay signed in.
  - **Signs out no one otherwise:** rewording the question, adding an answer, or changing only capitals.
  - **Race:** answers racing a change of answers, repeated 20 times, never leave a session from the old answer.
- **People page** (`people.test.ts`):
  - Only supporters with an email are listed.
  - The device count includes only this family's unexpired sessions of active supporters without a verified email.
- **Notifications** (`notifications.test.ts`): a reader without an email is never notified and never gets the one-time verification email.

Unit: `dropsAnAnswer`.

Each new access test gets the "prove it can fail" check: remove the rule it guards and confirm the test fails.

Existing tests that join through the gate with a name and email switch to answering, then giving an email. The gate's removed-email refusal test moves to "Giving an email."

## Cut for speed

- **Changing a given email,** for example to fix a typo. A supporter can sign out and answer again, or the family can remove the record.
- **Cleaning up dead anonymous records.** Records whose sessions have ended or expired stay in the database. They aren't listed or counted.
- **Limiting how many readers a correct answer can create.** A flood would show in the device count.
- **Last-seen tracking.** The device count includes devices that stopped reading but whose sessions haven't expired, for up to 180 days.

## Progress and discoveries
