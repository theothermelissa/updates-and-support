# Implementation Plan — Read first, email later

Implements "Joining," "Getting notification emails," "Returning on a new device," "Managing supporters," "Changing the community question," the session rule "Signing in to a family ends the browser's previous session for that family," and the related stated limits in `spec/access.md`. One session, one PR, one small migration.

## Design

### Data model

`Person.name` and `Person.email` become optional. A supporter who has only answered the question is a `Person` with role `supporter` and no name or email. Their session is an ordinary supporter session, so `getSession`, the feed, and every role check treat them like any other supporter.

The migration drops the two `NOT NULL`s and adds three CHECK constraints that the access rules rely on:

- `name` and `email` are both set or both empty.
- Family members always have an email.
- Only a row with an email can be verified, so a verified record can't escape the sign-out below by having no email.

The unique `(familyId, email)` constraint stays. Postgres treats NULLs as distinct, so any number of supporters can have no email. Every existing row satisfies the constraints, and the migration is backward-compatible with the code already running, which always writes both. Prisma doesn't model CHECK constraints and ignores them when checking for drift.

### Answering

`checkAnswer` runs inside the caller's transaction. It takes the gate's per-family advisory lock itself, counts wrong answers against the limits, and reads the accepted answers from the database under the lock rather than trusting the `family` the request loaded earlier. Taking the lock inside `checkAnswer` means no caller can forget it.

`answerGate(db, family, client, { answer })` runs `checkAnswer` and, on a correct answer, creates the supporter and their 180-day session, all in one transaction. Nothing is emailed. Any `name` or `email` in the body is ignored, so a page cached from before this change still works: its first request, `{ answer }`, now returns `joined`, which it already handles.

The gate handler returns `joined` without creating anything when the browser is already signed in to the family, such as from a gate left open in another tab, so a family member's session is never replaced by an anonymous one.

### Changing the answers

`changeQuestion` takes the same lock, using the gate's transaction timeouts since it can queue behind a burst of answers. It reads the current answers, saves the new ones, and then, if `dropsAnAnswer(before, after)`, deletes the unexpired sessions of the family's supporters without a verified email. It returns how many it ended, which matches the count the People page showed.

The `role: "supporter"` filter matters: family members who signed in before emails were verified can still hold sessions with no verified email.

`dropsAnAnswer` (pure, in `server/answers.ts`) is true when any old answer, normalized, is missing from the new answers, normalized. Rewording the question, adding an answer, or changing only capitals, spacing, or a leading "the" returns false.

The lock on both sides closes the race the spec rules out. An answer checked against the old answers either commits first, and its session is then deleted, or waits and is checked against the new answers.

### Giving an email

`addEmail(db, send, family, person, { name, email })` in `server/gate.ts`, for a signed-in supporter with no email:

- **Refuses** family members and supporters who already have an email (409), and an invalid name or email (400).
- **Email of a removed person:** 403, "This email can't join this family's updates. Please contact the family." Nothing changes.
- **Email of anyone else in the family:** nothing changes; that address gets a sign-in link through the existing, rate-limited `requestSignInLink`, and the result is `sign-in-link`.
- **New email:** one update, conditioned on `email: null`, sets the name and email, turns notifications on, and creates a verify link. Then the verification email is sent, logged rather than thrown on failure, and the result is `verify`.
  - The condition stops a second, concurrent submission from setting a different email while the first one's verify link is still live.
  - `P2002` (someone took the email a moment ago) is handled as a known email.
  - `P2025` (this supporter's email was set a moment ago) is a 409.

`personView` includes the person's own email, so the feed can show which address a confirmation went to, which helps catch typos.

### Ending a browser's previous session

`startSession(db, req, res, slug, token, lifetime)` in `server/http.ts` deletes the session in the browser's existing cookie for this family, if any, then sets the new cookie. The gate, `auth/sign-in`, and `auth/verify` use it. A reader without an email who signs in by link as their own record stops counting as a separate device.

### People page data

`listPeople` loads only people with an email, so anonymous records, which accumulate, are never loaded. It adds `devicesWithoutVerifiedEmail`, counted with the same filter the sign-out uses.

## Steps

1. Schema and migration. ✅
2. Null-safety for optional names and emails:
   - `requestSignInLink` sends to the normalized address it looked up.
   - `notifySupporters`, `unverifiedSupporters`, and `sendVerifications` skip people without an email.
   - Update author names default to empty, since only family members author updates. ✅
3. `dropsAnAnswer`, with unit tests. ✅
4. `server/gate.ts`: `lockGate`, the locking `checkAnswer`, `answerGate`, `addEmail`; `signInWithVerifyLink` on the new `checkAnswer`. ✅
5. `server/people.ts`: the `changeQuestion` sign-out, and the `listPeople` filter and device count. ✅
6. `server/email.ts`: the verification email now asks the person to confirm their email to get an email when the family posts, and still says to ignore it if they didn't ask. ✅
7. API:
   - `gate.ts` drops `sendEmail` and skips answering when the browser is already signed in.
   - New `email.ts` (POST `{ name, email }`, signed-in only).
   - `startSession` in `gate.ts`, `auth/sign-in.ts`, and `auth/verify.ts`. ✅
8. UI ✅:
   - **Gate:** one answer box.
   - **FamilyHome:**
     - "Signed in as" appears only for someone with a name.
     - A supporter without an email sees the email prompt at the top; the notifications checkbox appears only once they have an email.
     - The pending note names the address.
   - **People:**
     - The device count, the question form's explanation, and "Signed out N devices" after a save.
     - The Remove confirmation's warning and the new empty state.

## Tests

Integration, against real Postgres:

- **Answering** (`gate.test.ts`):
  - A correct answer signs in a new supporter with no name or email, valid only in this family, and records no attempt.
  - A wrong or limited answer creates no person or session.
  - Each correct answer is a separate supporter.
  - The limit tests now expect `joined` where they expected `correct`.
  - **Answers are read under the lock,** deterministically: the test holds the gate lock, starts an answer with a `family` loaded beforehand, changes the answers once the answer is queued, and expects `wrong`.
- **Giving an email** (`gate.test.ts`):
  - **New email:** it goes on the reader's own record, unverified, and its verify link works.
  - **An email already in the family:** neither record changes, the owner's sign-in link signs in as the owner, and the reader's session still belongs to the reader.
  - An email known only in another family counts as new here.
  - A removed supporter's or family member's email: 403; nothing changes and nothing is sent.
  - **409 cases:**
    - a supporter who already has an email;
    - a second submission authorized before the first landed, which also leaves exactly one verify link;
    - a family member.
  - An invalid name or email: 400.
  - Two readers giving the same new email at once, repeated 10 times: one gets it, the other gets a sign-in link.
  - The email is still added if the verification email fails.
- **Changing the answers** (`people.test.ts`):
  - **Removing or changing an answer** signs out anonymous readers and supporters with an unverified email. These stay signed in: verified supporters, a family member whose email isn't verified, and another family's readers.
  - **Rewording, adding an answer, or changing only capitals** signs no one out.
  - **The change waits for an answer being checked, then signs out the reader it let in,** deterministically: the test holds the gate lock while creating that reader's session.
- **People page** (`people.test.ts`):
  - Only supporters with an email are listed.
  - The device count includes only this family's unexpired sessions of supporters without a verified email.
- **Notifications** (`notifications.test.ts`): a reader without an email is never notified and never gets the one-time verification email.

Unit: `dropsAnAnswer`.

## Cut for speed

- **Signing out other devices when an email is first verified.** Someone who knows the answer can give the email of a real person who isn't on the list yet. If that person confirms it, the device that gave it becomes a verified supporter: it survives answer changes and shows under whatever name it gave. Melissa accepted this for now; it's documented in the spec's Stated limits and is first on the backlog. The fix is to end every other session on the record the first time its email is verified, except the verifying browser's.
- **Changing a given email,** for example to fix a typo. A supporter can sign out and answer again, or the family can remove the record.
- **Cleaning up dead anonymous records.** Records whose sessions have ended or expired stay in the database. They aren't listed, loaded, or counted.
- **Limiting how many readers a correct answer can create.** A flood would show in the device count.
- **Last-seen tracking.** The device count includes devices that stopped reading but whose sessions haven't expired, for up to 180 days.
- **A test for `startSession`.** It only ends a session the browser itself held. It was verified by hand.

## Progress and discoveries

All steps are implemented. `npm run typecheck`, `npm test` (109 tests), and `npm run build` pass.

**Access review.** A subagent reviewed the plan against the spec and code before building. Its findings that changed the build:
- the family-member filter on the sign-out, after the original reasoning for skipping family members proved wrong;
- deterministic tests in place of a timing-based race test;
- a test for the `email: null` condition;
- `checkAnswer` taking the lock itself;
- the already-signed-in gate shortcut;
- the CHECK constraints;
- `notificationsOn: true` when an email is given;
- unexpired-only sign-out counts;
- the gate's timeouts for `changeQuestion`.

Its remaining finding is the first cut above.

**Proving the tests can fail.** Each rule below was removed in turn, and a test caught every one:
- reading answers from the caller's `family`, skipping the lock in `checkAnswer`, and reading answers before the lock;
- the sign-out itself, and the sign-out reaching verified supporters, family members, or other families;
- signing out when no answer stopped working;
- the lock in `changeQuestion`;
- moving the reader's session onto an email's existing owner;
- refusing removed emails;
- the `email: null` condition;
- the count's family and expiry filters;
- the listing filter.

**A test mistake caught by a failure.** The first "signs no one out" test changed the answers twice, and the second change dropped an answer the first had added. The test was wrong, not the code.

**Prisma's reset guard.** `prisma migrate reset` refuses to run for an AI agent without the user's explicit consent. After the migration was edited, local checks used a fresh database instead.

**By hand, in Chromium against a local server running the real handlers:**
- wrong and correct answers;
- the anonymous feed and its prompt;
- a new email's pending note;
- a known email's message, and its sign-in link signing that browser in as the family member while deleting the browser's anonymous session;
- the People page count and explanations;
- a stale gate answer leaving the family member signed in;
- changing the answer signing out the unverified reader and reporting "Signed out 1 device."
