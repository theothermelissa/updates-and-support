# Implementation Plan: Families and Family Sign-in

The first slice of the MVP in `spec/`. When it lands, the operator can create a family from the command line, and that family's members can sign in with a magic link, see who they are signed in as, add and remove other family members, and sign out. Supporters, the community question gate, and updates come in later slices.

Spec sections covered: `spec/access.md` → Families, Family members, Magic links, Sessions; `spec/MASTER_SPEC.md` → Not indexable, Emails carry no update content, Email is sent through Resend.

## How to read this plan

The work is split into milestones. Each one ends with a **Verify** step that proves it works before anything is built on top of it. Integration tests are reserved for access rules, per `CLAUDE.md`; other milestones are verified by hand, with curl, or in the browser pane. Mark each milestone `✅` when its Verify step passes.

## Design

### Data model

```
Family        id, slug (unique), displayName, question, acceptedAnswers (text[]), createdAt
FamilyMember  id, familyId, name, email, createdAt          unique (familyId, email)
MagicLink     id, familyMemberId, tokenHash (unique), expiresAt, usedAt?, createdAt
Session       id, familyMemberId, tokenHash (unique), expiresAt, createdAt
```

- Emails are stored lowercased and trimmed.
- `MagicLink` and `Session` point at `FamilyMember` only. The supporter slice adds a nullable `supporterId` to each, with a check that exactly one of the two is set.
- Removing a family member deletes the row; its links and sessions go with it by cascade. That is how removal ends sessions immediately.
- `question` and `acceptedAnswers` are stored now because the operator script sets them. They are not used until the gate slice.

### Tokens

Magic-link and session tokens are 32 random bytes, base64url-encoded. Only their SHA-256 hash is stored. A plain hash is safe here (no bcrypt needed) because the tokens are random and high-entropy, unlike passwords.

### Sessions and cookies

- One cookie per family, named `session_<slug>`, so a browser can be signed in to several families at once: `Secure` (except in local dev), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days.
- Every request that needs a session looks it up by token hash, checks it is unexpired, and checks that it belongs to the family named in the URL. A session for family A is never accepted for family B.

### Code layout

```
server/tokens.ts         newToken(), hashToken()                          pure
server/families.ts       createFamily(), findFamilyBySlug()
server/auth.ts           requestSignInLink(), signInWithLink(), getSession(), signOut()
server/familyMembers.ts  listMembers(), addMember(), removeMember()
server/email.ts          sendEmail(): Resend over fetch; logs to console when RESEND_API_KEY is unset
server/emails.ts         the text of each email
server/cookies.ts        read and write the session cookie
scripts/create-family.ts operator script
api/f/[slug]/...         thin handlers, listed per milestone
src/                     minimal pages, listed per milestone
```

Server functions take `db` (and `sendEmail` where needed) as arguments, so integration tests call them directly against the test database with a fake mailer that records what was sent.

### API

All under `/api/f/[slug]/`. Unknown slug → 404, the same as any unknown route.

| Method & path | Auth | Does |
|---|---|---|
| `POST auth/request-link` `{email}` | none | Sends a link if the email is a member; always replies `{ok: true}` |
| `POST auth/sign-in` `{token}` | none | Spends the link, sets the cookie, returns the member |
| `POST auth/sign-out` | session | Deletes the session, clears the cookie |
| `GET me` | session | `{family: {displayName}, member: {id, name, email}}`, or 401 |
| `GET members` | session | List of family members |
| `POST members` `{name, email}` | session | Adds a member and emails them a sign-in link |
| `DELETE members/[id]` | session | Removes a member, unless they are the last one |

### Pages

`src/` routes on `location.pathname` with a small hand-written switch. Four routes don't justify a router dependency.

- `/f/:slug/family`: email form ("Family sign-in") → "Check your email."
- `/f/:slug/sign-in?token=…`: a "Sign in" button that posts the token.
- `/f/:slug`: if signed in as a family member, "Signed in as … to …", the member list with add and remove, and "Sign out." Otherwise, a link to family sign-in. (The gate replaces this in the next slice.)

`vercel.json` rewrites `/f/*` to `index.html` so deep links load the app.

## Milestones

### 1. Schema

Add the four models above and create the migration.

**Verify:** `npm run db:migrate` applies cleanly to the local database; `npm run typecheck` and `npm test` pass.

### 2. Operator script

`npm run family:create` prompts for display name, question, accepted answers (comma-separated), and the first member's name and email. It generates the slug (lowercased first word of the display name after "The", plus 4 random characters from `a–z0–9`), creates the family and member in one transaction, and prints the family's URL.

Runs through `tsx`, added as a dev dependency. Node 24 can strip TypeScript types on its own, but it can't resolve the `.js` import extensions used by the Prisma-generated client, and `tsx` can.

**Verify:** run the script against the local database with a fictional family, then confirm the rows in `npx prisma studio`.

### 3. Email sending

`sendEmail({to, subject, text})` posts to Resend's REST API with `fetch`. Using `fetch` avoids taking on the Resend SDK as a dependency. With no `RESEND_API_KEY` set, it logs the email to the console instead, which is how local dev and tests run. New env vars in `.env.example`: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.

**Verify:** a one-off call with Melissa's Resend key delivers a real email to her inbox from the `mail.orbul.com` sender. This depends on Resend DNS being verified. If it isn't yet, we continue with console logging and do this check before the PR merges.

### 4. Magic links and sessions (server only)

Implement `server/tokens.ts` and `server/auth.ts`:

- `requestSignInLink(db, send, slug, email)`: if the email is a member of that family and fewer than 5 links were created for them in the last hour, it creates a link (15-minute expiry) and emails it. The return value is the same in every case.
- `signInWithLink(db, slug, token)`: accepts a link only if it is unused, unexpired, and belongs to a member of that family. It marks the link used and creates a session in the same transaction.
- `getSession(db, slug, token)`: returns the member, or null.
- `signOut(db, token)`.

**Verify:** the integration tests below pass.

### 5. Sign-in API and cookie

Handlers for `auth/request-link`, `auth/sign-in`, `auth/sign-out`, and `me`, plus `server/cookies.ts`.

**Verify:** run `npm run dev` and use curl to request a link for the fictional member, copy the token from the console log, post it to `auth/sign-in`, and check that `me` returns the member with that cookie and 401 without it. Then post it again and check that the second sign-in fails.

### 6. Sign-in pages, `noindex`, `robots.txt`

The three pages, `vercel.json` rewrites, a `<meta name="robots" content="noindex">` tag, an `X-Robots-Tag: noindex` header on every response (set in `vercel.json`), and a `public/robots.txt` that disallows everything.

**Verify:** in the browser pane, walk through family sign-in → copy the link from the console → press "Sign in" → see "Signed in as …" → sign out → be signed out. Then check `curl -I` for the `X-Robots-Tag` header and fetch `/robots.txt`.

### 7. Add and remove family members

`server/familyMembers.ts`, the `members` endpoints, and the member list UI on `/f/:slug`.

**Verify:** integration tests below pass; in the browser pane, add a second fictional member, sign in as them from the logged link, and remove the first.

### 8. Preview deploy and migrations

Settle the backlog item on migrations now that the first model exists. Proposal: the Vercel build runs `prisma migrate deploy` against `DATABASE_URL_UNPOOLED` before `vite build`. Each preview's own Neon branch then gets the PR's schema, and production migrates as part of deploying `main`. That removes the manual `db:deploy` step. Set `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` in Vercel. Create one fictional family on the preview database with the script.

**Verify:** open a PR; CI passes; on the Vercel preview, sign in by a real emailed magic link and add and remove a member.

## Tests

Integration tests against real Postgres, in `tests/integration/`. Each one guards an access rule.

**Magic links and sessions** (`auth.test.ts`)
- A known member's email gets exactly one email containing a link; an unknown email gets none. Both calls return the same value.
- An email that is a member of family A but not family B gets nothing when requesting a link from family B.
- A link signs in once; the second use fails.
- An expired link fails.
- A link created for family A fails at family B's sign-in.
- The stored link and session hold only hashes; the raw token appears nowhere in the database.
- The sixth request within an hour for the same email sends nothing.
- A session for family A returns null from `getSession` for family B.
- An expired session returns null.
- After sign-out, the session returns null.

**Family members** (`familyMembers.test.ts`)
- Adding a member stores a lowercased email and sends them a sign-in link.
- A member cannot add, list, or remove members of another family.
- Removing a member ends their sessions immediately.
- The last member of a family cannot be removed.

**Unit tests**
- `hashToken` is deterministic, and `newToken` produces distinct 43-character tokens.
- Slug generation produces `<word>-<4 chars>` and drops a leading "The".

## Shortcuts taken for speed

- **Response timing can reveal membership.** `request-link` takes measurably longer when it sends an email. Hiding that needs background work after the response, which means adding `@vercel/functions`. The risk is limited to someone with the family's address probing member emails, and it's acceptable for today.
- **No CSRF tokens.** `SameSite=Lax` cookies and JSON-only POST bodies block cross-site form posts. That's enough here without a token scheme.
- **No session cleanup job.** Expired sessions and links stay in the table and are ignored. A cleanup can come later.
- **Plain, unstyled pages.** Styling comes after the MVP works end to end.
- **No editing a family member's name or email.** Remove and re-add instead.
