# Implementation Plan: The Supporter Gate

The second slice of the MVP in `spec/`. When it lands, a visitor to a family's address sees the gate. A visitor who answers the community question can join with their name and email and read the feed right away. Returning supporters sign in by magic link, and wrong answers are limited per browser and per network.

Spec sections covered: `spec/access.md` → Supporters → Joining (steps 1–3 and the known-email rule), Answer matching, Wrong-answer limits, Returning on a new device (signing in), Signing out; Stated limits.

## Slice order

1. Families, family sign-in, and updates. **Shipped.**
2. **This plan.** The supporter gate, joining, and supporter sign-in.
3. Notifications: email verification (the "Confirm my email" step after joining, and marking an email verified by magic link), notification emails, turning notifications on and off, and unsubscribe.
4. Managing people: adding and removing family members, the supporter list, removing and restoring supporters (including refusing a removed supporter who tries to join again), and changing the community question.

Verification moves to slice 3 because a verified email matters only for notifications. Refusing removed supporters moves to slice 4 because nothing can remove a supporter until then.

## How to read this plan

The work is split into milestones. Each one ends with a **Verify** step that proves it works before anything is built on top of it. Integration tests are reserved for access rules, per `CLAUDE.md`. Other milestones are verified by hand, with curl, or in the browser pane. Mark each milestone `✅` when its Verify step passes.

## Design

### Data model

One new table. `Person` already has the `supporter` role and session lengths from slice 1.

```
GateAttempt  id, familyId, browserId, network, createdAt
             index (familyId, browserId, createdAt), index (familyId, network, createdAt)
```

A row is a wrong answer. Only wrong answers are recorded, and they count against both limits for one hour.

### Answer matching

`normalizeAnswer` lowercases, trims, collapses inner whitespace to one space, and drops a leading "the ". An answer is correct if its normalized form equals the normalized form of any accepted answer.

### Limits

- **Browser:** a random `gate_browser` cookie (`HttpOnly`, `SameSite=Lax`, one year), set on the first gate request that lacks one. Clearing cookies resets it, so it only slows a casual guesser; the network limit is the real one.
- **Network:** the client's address from Vercel's `x-real-ip` header, which Vercel sets itself and clients can't forge. `networkKey` keeps an IPv4 address as is and reduces an IPv6 address to its `/64` prefix. An IPv4 address written in IPv6 form (`::ffff:1.2.3.4`) counts as IPv4.
- When the browser has 5 or the network has 30 wrong answers for this family in the last hour, every answer is refused, right or wrong, without being checked.

### Joining without stored state

The page asks for the answer and checks it. On a correct answer it asks for the name and email, then sends the answer again with them. The server checks the answer again on join, under the same limits, so calling the join endpoint directly doesn't skip the question. Nothing is stored between the two steps.

On join, with a correct answer:

- **New email:** creates a `supporter` with that name and email, starts a 180-day session, and sets the session cookie.
- **Email already in the family** (supporter or family member): creates nothing, sends a magic link through the existing `requestSignInLink`, and says "Check your email." If two joins with the same new email race, the loser hits the unique `(familyId, email)` constraint and is treated as a known email.

Names are trimmed and must be 1 to 100 characters. Emails are trimmed, lowercased, must contain an `@`, and may be at most 254 characters.

### Code layout

```
server/answers.ts    normalizeAnswer(), isCorrectAnswer()                    pure
server/network.ts    networkKey()                                            pure
server/gate.ts       gateInfo(), checkAnswer(), join()
server/cookies.ts    add the browser cookie; cookies append instead of overwrite,
                     since join sets two
server/http.ts       clientOf(req): the browser ID and network key
api/f/[slug]/gate/   thin handlers, listed under API
src/pages/           Gate.tsx; SignInByEmail.tsx (FamilySignIn.tsx renamed)
```

### API

All under `/api/f/[slug]/`. Unknown slug → 404.

| Method & path | Auth | Does |
|---|---|---|
| `GET gate` | none | `{displayName, question}`, and nothing else about the family |
| `POST gate/answer` `{answer}` | none | `{result: "correct" \| "wrong" \| "limited"}` |
| `POST gate/join` `{answer, name, email}` | none | `{result: "joined" \| "check-email" \| "wrong" \| "limited"}`; sets the session cookie on `joined`; 400 for an invalid name or email |

### Pages

- `/f/:slug` when not signed in: **the gate.** The family's display name, the question, and an answer box. A correct answer shows name and email fields. Wrong: "That's not the answer we have. Please try again." Limited: "Too many attempts. Please try again later." Joined: the page reloads into the feed. Known email: "Check your email." Below the form are two links: "Already joined? Sign in by email" and "Family sign-in." Both go to the same sign-in-by-email page, because the server sends the same link either way.
- `/f/:slug/sign-in-by-email`: the email form from slice 1, retitled "Sign in by email." `/f/:slug/family` keeps working as another address for it.
- Signed-in supporters see the feed without the post form or the Edit and Delete buttons. The feed component already handles this through `canEdit`.

## Milestones

### 1. Schema

Add `GateAttempt` and create the migration.

**Verify:** `npm run db:migrate` applies cleanly; `npm run typecheck` and `npm test` pass.

### 2. Answer matching and network keys

`server/answers.ts` and `server/network.ts`, with unit tests.

**Verify:** the unit tests below pass.

### 3. Gate logic (server only)

`gateInfo`, `checkAnswer`, and `join` in `server/gate.ts`.

**Verify:** the integration tests below pass, and each access test fails when the rule it guards is removed.

### 4. Gate API

The three handlers, the browser cookie, appending cookies, and `clientOf`.

**Verify:** with `npm start` and curl, check that `gate` returns only the display name and question, that a wrong answer returns `wrong`, and that the sixth wrong answer returns `limited`. Then join with a new email and check `me` returns a supporter, and join with a family member's email and check an email is logged and no cookie is set.

### 5. Gate pages

The gate, the join step, the sign-in-by-email page, and the links.

**Verify:** in the browser pane, a signed-out visit shows the gate. A wrong answer shows the message. A correct answer, with "the" and extra spaces, leads to the join step. Joining shows the feed with no post form. Signing out returns to the gate. "Already joined?" sends a link that signs back in.

### 6. Operator script message

`family:create` prints "Creating the family…" before it connects to the database, so a slow or failing connection doesn't look like a frozen prompt.

**Verify:** run it against the local database.

### 7. Preview and merge

Open a PR; CI passes. On the preview, using the existing test family: join as a supporter with a second email address you control, read the feed, and confirm there is no way to post. Then try joining with the family member's email and confirm a sign-in email arrives instead. After merging, check on production that `GET gate` for a real family returns only the display name and question.

## Tests

Integration tests against real Postgres, in `tests/integration/gate.test.ts`. Each guards an access rule.

- `gateInfo` returns exactly the display name and question; in particular, never the accepted answers.
- A correct answer passes in any accepted form after normalization; a wrong answer is refused and recorded.
- The sixth answer from one browser within an hour is refused even when correct; a different browser on a different network is unaffected.
- The thirty-first answer from one network within an hour is refused across different browsers.
- Wrong answers at family A don't count toward family B's limits.
- Joining with a wrong answer creates no person and no session.
- Joining while limited creates no person and no session, even with the correct answer.
- Joining with a new email creates a supporter with a lowercased email and a session that `getSession` accepts for this family only.
- Joining with an email that belongs to a supporter or a family member of this family creates nothing, starts no session, and emails a sign-in link.

**Unit tests**
- `normalizeAnswer` lowercases, trims, collapses whitespace, and drops a leading "the "; `isCorrectAnswer` matches any accepted answer.
- `networkKey` keeps IPv4, reduces full and compressed IPv6 to the `/64`, and treats `::ffff:1.2.3.4` as `1.2.3.4`.

## Shortcuts taken for speed

- **No email verification on joining.** Anyone with the answer can join with any email and read. That's within the spec's stated limits; verification arrives with notifications in slice 3.
- **No refusal of removed supporters.** Removal arrives in slice 4, and the refusal comes with it.
- **The per-browser limit is a speed bump.** It can be reset by clearing cookies; the per-network limit is the real one.
- **No cleanup of old gate attempts.** Rows older than an hour are ignored. A cleanup can come later.
