# Implementation Plan: Email Verification

The first half of slice 3 in `spec/`. When it lands, a supporter who joins gets an email with a link to a "Confirm my email" page, and pressing the button marks their email verified. Signing in by magic link also marks an email verified. Nothing reads the verified flag yet; notification emails, which only go to verified supporters, are the next slice.

Spec sections covered: `spec/access.md` → Supporters → Joining (step 4 and verification links), Returning on a new device (marking the email verified).

## Slice order

1. Families, family sign-in, and updates. **Shipped.**
2. The supporter gate, joining, and supporter sign-in. **Shipped.**
3. **This plan:** email verification.
4. Notifications: notification emails to verified supporters, the "Notify supporters by email" checkbox, turning notifications on and off, and unsubscribe. Before it launches, a one-time script sends verification emails to supporters who joined before this plan shipped.
5. Managing people: adding and removing family members, the supporter list (which shows who is verified), removing and restoring supporters, and changing the community question.

Verification ships before notifications so that supporters joining now are verified by the time notifications launch.

## How to read this plan

The work is split into milestones. Each one ends with a **Verify** step that proves it works before anything is built on top of it. Integration tests are reserved for access rules, per `CLAUDE.md`. Other milestones are verified by hand, with curl, or in the browser pane. Mark each milestone `✅` when its Verify step passes.

## Design

### Data model

```
Person     + emailVerifiedAt?
MagicLink  + purpose ('sign_in' | 'verify'), default 'sign_in'
```

Verification links reuse the magic-link table: same random token, stored only as a hash, single use. The `purpose` column keeps the two kinds apart, so a verification link can never sign anyone in and a sign-in link can never be spent on the verification page.

### Behavior

- **Joining** creates the supporter and their session, as it does now, then sends a verification link that expires in 7 days. If sending fails, the error is logged and joining still succeeds.
- **Pressing "Confirm my email"** spends an unused, unexpired verification link for this family and sets `emailVerifiedAt`. It starts no session and sets no cookie.
- **Signing in by magic link** also sets `emailVerifiedAt` if it isn't set yet, in the same transaction that spends the link.
- Verification links count toward the existing limit of 5 links per email per hour, which is harmless: joining creates one.

### Code layout

```
server/auth.ts      signInWithLink() accepts only sign-in links and marks the email verified;
                    sendVerification() and verifyEmail() added
server/email.ts     verificationEmail()
server/gate.ts      join sends the verification after creating the supporter
api/f/[slug]/auth/verify.ts   thin handler
src/pages/Verify.tsx          the "Confirm my email" page
```

### API

| Method & path | Auth | Does |
|---|---|---|
| `POST auth/verify` `{token}` | none | Spends a verification link and marks the email verified; `{ok: true}`, or 400 |

### Email and page

- **Email:** subject "Confirm your email for The Rivera Family's updates," with a link to `/f/:slug/verify#token=…`, carried after `#` like sign-in links, and a note that the link lasts 7 days. Like every email, it names the family and carries a link, nothing more.
- **Page:** `/f/:slug/verify` shows a "Confirm my email" button. On success: "Thanks, your email is confirmed." On failure: "This link has expired or was already used." Without a token: "This link is incomplete."

## Milestones

### 1. Schema

Add `Person.emailVerifiedAt` and `MagicLink.purpose`, and create the migration.

**Verify:** `npm run db:migrate` applies cleanly; `npm run typecheck` and `npm test` pass.

### 2. Verification (server only)

`sendVerification`, `verifyEmail`, the purpose check and verified flag in `signInWithLink`, the email text, and the call from joining.

**Verify:** the integration tests below pass, and each access test fails when the rule it guards is removed.

### 3. API and page

The `auth/verify` handler, the verify page, and its route.

**Verify:** in the browser pane, join as a fictional supporter, open the logged verification link, press the button, and see the confirmation. Check in the database that the email is verified and that no new session was created. Press it again and see the expired message.

### 4. Preview and merge

Open a PR; CI passes. On the preview, join with a real address you control, confirm from the emailed link, and confirm you're not signed in by doing so in a private window.

## Tests

Integration tests against real Postgres, in `tests/integration/verify.test.ts`. Each guards an access rule.

- Joining sends exactly one email, a verification link, to the new supporter, who is unverified until it is used.
- Pressing confirm with that link marks the email verified and creates no session.
- A verification link cannot sign anyone in, and a sign-in link cannot verify.
- A verification link works once; after 7 days it fails; at another family's address it fails.
- Signing in with a magic link marks the email verified.
- If the verification email fails to send, joining still succeeds and the supporter is signed in.

## Shortcuts taken for speed

- **No "resend verification" button.** Signing in by email verifies too. A resend can come later if supporters get stuck.
- **Supporters who joined before this ships stay unverified** until they sign in by email. The notifications slice sends them a verification email before notifications launch.
- **Verification status isn't shown anywhere yet.** The family's supporter list, in the managing-people slice, shows it.
