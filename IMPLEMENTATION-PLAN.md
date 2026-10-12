# Implementation Plan: Families, Family Sign-in, and Updates

The first slice of the MVP in `spec/`. When it lands, the operator can create a family and its family members from the command line, and those family members can sign in with a magic link and post, edit, delete, and read updates. Only family members can read the feed until the supporter slice adds the gate.

Spec sections covered: `spec/access.md` → Families, Family members → Signing in, Magic links, Sessions; `spec/updates.md` → An update, The feed, Posting, Editing, Deleting; `spec/MASTER_SPEC.md` → Not indexable, Emails carry no update content, Email is sent through Resend.

## Slice order

The MVP ships in four slices, ordered so each one is useful on its own:

1. **This plan.** Families, family sign-in, and updates.
2. The supporter gate, supporter joining and sign-in, and email verification. Supporters can now read.
3. Notification emails and unsubscribe.
4. Managing people in the app: adding and removing family members, the supporter list, and changing the community question. Until this lands, the operator makes membership changes.

## How to read this plan

The work is split into milestones. Each one ends with a **Verify** step that proves it works before anything is built on top of it. Integration tests are reserved for access rules, per `CLAUDE.md`. Other milestones are verified by hand, with curl, or in the browser pane. Mark each milestone `✅` when its Verify step passes.

## Design

### Data model

```
Family     id, slug (unique), displayName, question, acceptedAnswers (text[]), createdAt
Person     id, familyId, role ('family' | 'supporter'), name, email, createdAt
           unique (familyId, email)
MagicLink  id, personId, tokenHash (unique), expiresAt, usedAt?, createdAt
Session    id, personId, tokenHash (unique), expiresAt, createdAt
Update     id, familyId, authorId → Person, body, createdAt, editedAt?
           index (familyId, createdAt)
```

- Family members and supporters share one `Person` table with a `role`. Sign-in, sessions, and rate limits are written once for both, and every permission check is a `role` check. The unique `(familyId, email)` enforces the spec's rule that an email belongs to at most one person in a family.
- The supporter slice adds its supporter-only columns to `Person` (verified email, notifications, removed). Removing a person (slice 4) will mark the row removed and delete their sessions and links, not delete the row, so their updates keep their author.
- Emails are stored lowercased and trimmed.
- `question` and `acceptedAnswers` are stored now because the operator script sets them. They are not used until the gate slice.

### Tokens

Magic-link and session tokens are 32 random bytes, base64url-encoded. Only their SHA-256 hash is stored. A plain hash is safe here (no bcrypt needed) because the tokens are random and high-entropy, unlike passwords.

### Sessions and cookies

- One cookie per family, named `session_<slug>`, so a browser can be signed in to several families at once: `Secure` (except in local dev), `HttpOnly`, `SameSite=Lax`, `Path=/`.
- Session length comes from the person's role: 30 days for family members, 180 for supporters. The cookie's `Max-Age` matches.
- Every request that needs a session looks it up by token hash, checks it is unexpired, and checks that its person belongs to the family named in the URL. A session for family A is never accepted for family B.

### Authorization

Handlers resolve the session to a `Person` and pass it to `server/` functions. Those functions scope every query by `person.familyId` and check `person.role` before any write. An update ID from another family behaves exactly like an ID that doesn't exist.

### Code layout

```
server/tokens.ts         newToken(), hashToken()                               pure
server/slug.ts           makeSlug()                                            pure
server/families.ts       createFamily(), findFamilyBySlug()
server/auth.ts           requestSignInLink(), signInWithLink(), getSession(), signOut()
server/updates.ts        listUpdates(), createUpdate(), editUpdate(), deleteUpdate()
server/email.ts          sendEmail() and the text of each email
server/cookies.ts        read and write the session cookie; sessionFromRequest()
scripts/create-family.ts operator script
src/linkify.ts           splits update text into text and link segments       pure
api/f/[slug]/...         thin handlers, listed under API
src/                     minimal pages, listed under Pages
```

Server functions take `db` (and `sendEmail` where needed) as arguments, so integration tests call them directly against the test database with a fake mailer that records what was sent.

### API

All under `/api/f/[slug]/`. Unknown slug → 404, the same as any unknown route.

| Method & path | Auth | Does |
|---|---|---|
| `POST auth/request-link` `{email}` | none | Sends a link if the email belongs to anyone in the family; always replies `{ok: true}` |
| `POST auth/sign-in` `{token}` | none | Spends the link, sets the cookie, returns the person |
| `POST auth/sign-out` | session | Deletes the session, clears the cookie |
| `GET me` | session | `{family: {displayName}, person: {id, name, role}}`, or 401 |
| `GET updates` | session | The family's updates, newest first, with author names |
| `POST updates` `{body}` | family member | Creates an update |
| `PATCH updates/[id]` `{body}` | family member | Edits an update's body and sets `editedAt` |
| `DELETE updates/[id]` | family member | Deletes an update permanently |

A body is trimmed and must be 1 to 20,000 characters; anything else gets a 400.

### Pages

`src/` routes on `location.pathname` with a small hand-written switch. Three routes don't justify a router dependency.

- `/f/:slug/family`: email form ("Family sign-in") → "Check your email."
- `/f/:slug/sign-in?token=…`: a "Sign in" button that posts the token, then goes to `/f/:slug`.
- `/f/:slug`: when signed in, the family's display name, "Signed in as …", "Sign out," and the feed. Family members also see a post form and "Edit" and "Delete" on each update; "Delete" asks for confirmation. When not signed in, a "Family sign-in" link (the gate replaces this in slice 2). When `me` returns 404, "Not found."

Update bodies render with line breaks kept (`white-space: pre-wrap`). `linkify` matches only `http://` and `https://` addresses and returns segments that render as React elements, so update text never reaches the page as HTML. Links get `rel="noopener noreferrer"`.

`vercel.json` rewrites `/f/*` to `index.html` so deep links load the app.

## Milestones

### 1. Schema ✅

Add the five models above and create the migration.

**Verify:** `npm run db:migrate` applies cleanly to the local database; `npm run typecheck` and `npm test` pass.

### 2. Operator script ✅

`npm run family:create` prompts for the display name, the question, and the accepted answers (comma-separated), then asks for family members' names and emails one at a time until a blank name. It requires at least one. It creates the family and its members in one transaction and prints the family's URL.

`makeSlug(displayName)` drops a leading "The", takes the first word, lowercases it, removes accents, and keeps only `a–z0–9`, falling back to `family` if nothing is left. It then appends `-` and 8 random characters from `a–z0–9`, chosen with `crypto`.

The script runs through `tsx`, added as a dev dependency. Node 24 can strip TypeScript types on its own, but it can't resolve the `.js` import extensions used by the Prisma-generated client, and `tsx` can.

**Verify:** run the script against the local database with a fictional family of two members, then confirm the rows in `npx prisma studio`.

### 3. Email sending

`sendEmail({to, subject, text})` posts to Resend's REST API with `fetch`. Using `fetch` avoids taking on the Resend SDK as a dependency. With no `RESEND_API_KEY` set, it logs the email to the console instead, which is how local dev and tests run. New env vars in `.env.example`: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.

**Verify:** a one-off call with Melissa's Resend key delivers a real email to her inbox from the `mail.orbul.com` sender. This depends on Resend DNS being verified. If it isn't yet, we continue with console logging and do this check before the PR merges.

### 4. Magic links and sessions (server only) ✅

Implement `server/tokens.ts` and `server/auth.ts`:

- `requestSignInLink(db, send, slug, email)`: if the email belongs to a person in that family and fewer than 5 links were created for them in the last hour, it creates a link (15-minute expiry) and emails it. The return value is the same in every case.
- `signInWithLink(db, slug, token)`: accepts a link only if it is unused, unexpired, and belongs to a person in that family. It marks the link used and creates a session in the same transaction.
- `getSession(db, slug, token)`: returns the person, or null.
- `signOut(db, token)`.

**Verify:** the auth integration tests below pass.

### 5. Sign-in API and cookie ✅

Handlers for `auth/request-link`, `auth/sign-in`, `auth/sign-out`, and `me`, plus `server/cookies.ts`.

**Verify:** run `npm start` and use curl to request a link for the fictional member, copy the token from the console log, post it to `auth/sign-in`, and check that `me` returns the person with that cookie and 401 without it. Then post the token again and check that the second sign-in fails.

### 6. Sign-in pages, `noindex`, `robots.txt`

The three pages (with a placeholder feed), `vercel.json` rewrites, a `<meta name="robots" content="noindex">` tag, an `X-Robots-Tag: noindex` header on every response (set in `vercel.json`), and a `public/robots.txt` that disallows everything.

**Verify:** in the browser pane, walk through family sign-in → copy the link from the console → press "Sign in" → see "Signed in as …" → sign out → be signed out. Then check `curl -I` for the `X-Robots-Tag` header and fetch `/robots.txt`.

### 7. Updates

`server/updates.ts`, the `updates` endpoints, `src/linkify.ts`, and the feed on `/f/:slug`.

**Verify:** the updates integration tests and the `linkify` unit tests pass. In the browser pane, sign in as each fictional member; post an update with line breaks and a link, edit it as the other member and see the "edited" mark, then delete it after confirming.

### 8. Preview deploy and migrations

This settles the backlog item on migrations.

- Add a `vercel-build` script: `prisma generate && prisma migrate deploy && vite build`. Vercel runs `vercel-build` instead of `build` when it exists, so CI's `npm run build` keeps working without a database.
- `prisma.config.ts` uses `DATABASE_URL_UNPOOLED` when it is set, falling back to `DATABASE_URL`.

Each preview's own Neon branch then gets the PR's schema, and production migrates as part of deploying `main`. That removes the manual `db:deploy` step; update the README's Deployment section to match. Set `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` in Vercel, and create one fictional family on the preview database with the script.

**Verify:** open a PR; CI passes; on the Vercel preview, sign in by a real emailed magic link and post, edit, and delete an update.

## Tests

Integration tests against real Postgres, in `tests/integration/`. Each one guards an access rule.

**Magic links and sessions** (`auth.test.ts`)
- A known person's email gets exactly one email containing a link; an unknown email gets none. Both calls return the same value.
- An email that belongs to family A but not family B gets nothing when requesting a link from family B.
- A link signs in once; the second use fails.
- An expired link fails.
- A link created for family A fails at family B's sign-in.
- The stored link and session hold only hashes; the raw token appears nowhere in the database.
- The sixth request within an hour for the same email sends nothing.
- A session for family A returns null from `getSession` for family B.
- An expired session returns null.
- After sign-out, the session returns null.

**Updates** (`updates.test.ts`)
- A family member of A lists only family A's updates.
- A family member of A cannot edit or delete family B's update by ID, and B's update is unchanged.
- A supporter (created directly in the test) can list updates but cannot create, edit, or delete them.
- Editing sets `editedAt` and keeps the original author; deleting removes the row.

**Unit tests**
- `hashToken` is deterministic, and `newToken` produces distinct 43-character tokens.
- `makeSlug` produces `<word>-<8 chars>`, drops a leading "The", strips accents and punctuation ("The O'Brién Family" → `obrien-…`), and falls back to `family`.
- `linkify` links `http(s)://` addresses, leaves surrounding text intact, and does not link `javascript:` or other schemes.

## Shortcuts taken for speed

- **No in-app membership changes.** Adding and removing family members comes in slice 4. Until then, the operator makes changes directly in the database.
- **Response timing can reveal membership.** `request-link` takes measurably longer when it sends an email. Hiding that needs background work after the response, which means adding `@vercel/functions`. The risk is limited to someone with the family's address probing for emails, and it's acceptable for today.
- **No CSRF tokens.** `SameSite=Lax` cookies and JSON-only bodies block cross-site form posts. That's enough here without a token scheme.
- **No session cleanup job.** Expired sessions and links stay in the table and are ignored. A cleanup can come later.
- **Plain, unstyled pages.** Styling comes after the MVP works end to end.
- **No notify checkbox on the post form.** There are no supporters to notify until slice 2; the checkbox arrives with notifications in slice 3.

## Discoveries

- **`vercel dev` refuses to run from a `dev` script.** The CLI treats any `dev` script that calls `vercel dev` as a recursive invocation. The local command is `npm start` instead, and `vercel.json` sets `devCommand` to Vite.
- **Readline's `question()` drops piped input.** Lines that arrive before a question is asked are lost. The operator script reads lines through an iterator, so it works both typed and piped.
