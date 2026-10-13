# Implementation Plan: Notifications

When it lands, a family member posting an update can email every verified, opted-in supporter that there's a new update. Supporters can turn these emails off or on, and can unsubscribe from any email without signing in. A one-time script sends verification emails to supporters who joined before verification existed, so they can receive notifications too.

Spec sections covered: `spec/updates.md` → Posting (the checkbox), Notifications; `spec/access.md` → Supporters → Signing out and notifications.

## Slice order

1. Families, family sign-in, and updates. **Shipped.**
2. The supporter gate, joining, and supporter sign-in. **Shipped.**
3. Email verification. **Shipped.**
4. **This plan:** notifications.
5. Managing people: adding and removing family members, the supporter list, removing and restoring supporters, and changing the community question.

## How to read this plan

The work is split into milestones. Each one ends with a **Verify** step that proves it works before anything is built on top of it. Integration tests are reserved for access rules, per `CLAUDE.md`. Other milestones are verified by hand, with curl, or in the browser pane. Mark each milestone `✅` when its Verify step passes.

## Design

### Data model

```
Person  + notificationsOn  Boolean, default true
        + unsubscribeToken UUID, unique, @default(dbgenerated("gen_random_uuid()")) so the
                           database gives every existing row its own
```

The unsubscribe token is stored as is, not hashed. It appears in each email's `List-Unsubscribe` address, which request logs record, and all it can do is turn off notifications for one person.

### Sending

- One batch sender, `SendEmails = (emails: Email[]) => Promise<void>`, is used for notifications and the one-time verification send; the existing single `sendEmail` stays as it is. `createUpdate` takes an optional sender. When given one (the post form's checkbox was checked), it emails every **supporter** of the family whose email is **verified** and whose **notifications are on**, after saving the update.
- Emails go through Resend's batch endpoint, up to 100 per request, so a large family takes a second or two, inside the posting request. No queue.
- If sending fails, the error is logged and the update is still posted. A failed batch is logged and the next one is still tried. Logs name the family and the count, not addresses.
- Editing never sends anything.

### The email

- **Subject:** "New update from The Rivera Family"
- **Body:** that there's a new update, a link to the family's site, and a link to `/f/:slug/unsubscribe#token=…` to turn these emails off. No update content.
- **Headers:** `List-Unsubscribe: <https://…/api/f/:slug/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Mail apps POST to that address with a form or multipart body, so the endpoint reads the token only from `?token=` and ignores the body. The page posts to the same address, so there is one path.

### Turning notifications off and on

- **Without signing in:** `POST unsubscribe?token=…` turns notifications off for the person matching the token, the family in the address, and the supporter role, all in one `updateMany`. A token for another family does nothing. Anything that isn't a UUID is turned away before the query, since Postgres would otherwise raise an error. The response is the same either way.
- **Signed in:** a supporter sees an "Email me when there's a new update" checkbox under "Signed in as." `POST notifications {on}` changes only the signed-in supporter's own setting. Family members get a 403, since they're never notified.

### One-time verification send

`npm run verification:send` finds every supporter whose email isn't verified, shows how many, asks for confirmation, then creates a 7-day verification link for each and emails it. It runs against whatever `DATABASE_URL` it's given, like `family:create`. Melissa runs it once against production after this merges.

### Code layout

```
server/email.ts           Email gains optional headers; sendEmails() batches through
                          Resend; notificationEmail()
server/notifications.ts   notifySupporters(), unsubscribe(), setNotifications(),
                          sendPendingVerifications()
server/updates.ts         createUpdate() takes an optional sender
server/http.ts            personView() adds notificationsOn
api/f/[slug]/unsubscribe.ts, api/f/[slug]/notifications.ts   thin handlers
api/f/[slug]/updates/index.ts   reads {body, notify}
scripts/send-verifications.ts
src/pages/Unsubscribe.tsx, the post form's checkbox, the supporter's checkbox; src/App.tsx
                          adds `unsubscribe` to the route pattern
```

### API

| Method & path | Auth | Does |
|---|---|---|
| `POST updates` `{body, notify}` | family member | Creates an update; emails supporters when `notify` is true |
| `POST unsubscribe?token=…` (any body) | none | Turns that supporter's notifications off; always `{ok: true}` |
| `POST notifications` `{on}` | supporter | Turns the signed-in supporter's notifications on or off |

## Milestones

### 1. Schema ✅

Add the two `Person` columns and create the migration.

**Verify:** `npm run db:migrate` applies cleanly, existing supporters get distinct tokens, and `npm run typecheck` and `npm test` pass.

### 2. Notifications (server only) ✅

`sendEmails`, the email text, `notifySupporters`, `unsubscribe`, `setNotifications`, `sendPendingVerifications`, and the optional sender on `createUpdate`.

**Verify:** the integration tests below pass, and each access test fails when the rule it guards is removed.

### 3. API, pages, and script ✅

The three handlers, the unsubscribe page and route, both checkboxes, and `verification:send`.

**Verify:** in the browser pane, post with the box checked and see one logged email per verified, opted-in supporter, then post with it unchecked and see none. Open a logged unsubscribe link, press the button, and confirm that supporter is opted out. As a supporter, toggle the checkbox off and on. With curl, POST the header's address with a form body and confirm it opts out. Run `verification:send` locally and confirm it sends only to unverified supporters.

### 4. Preview and merge

Open a PR; CI passes. On the preview's test family, join as a supporter with a `+` address and verify it, post as the family member, and confirm the notification arrives with no update text, that Gmail's "Show original" lists `List-Unsubscribe` among the DKIM-signed headers, and whether Gmail shows its own "Unsubscribe" option. Use the email's link to turn notifications off, post again, and confirm nothing arrives. After merging, Melissa runs `verification:send` against production.

## Tests

Integration tests against real Postgres, in `tests/integration/notifications.test.ts`. Each guards an access or privacy rule.

- Posting with notifications emails exactly the verified, opted-in supporters of this family, never unverified or opted-out supporters, family members, or another family's supporters.
- A notification email names the family, links to its site, carries that recipient's own unsubscribe link and headers, and neither its subject nor its text contains the update's text.
- Posting without notifications, and editing, send nothing.
- If sending fails, the update is still saved.
- An unsubscribe token turns off only its own supporter, only at their family's address: the same token at another family's address, and every other supporter, stay opted in. A malformed token (`"abc"`) changes nothing and doesn't error.
- A supporter can turn their own notifications off and on; a family member can't.
- `sendPendingVerifications` emails unverified supporters only, never verified supporters or family members.

## Shortcuts taken for speed

- **Sending happens inside the posting request.** Fine for families of up to a few hundred supporters; a queue can come later.
- **Send failures are only logged.** The family isn't told when notifications fail to go out.
- **Unsubscribe tokens are stored unhashed.** They can only turn off one person's notifications.
- **No preference beyond on/off.** No digests or per-update choices.

## Discoveries

- **`prisma migrate dev` can't confirm warnings without a terminal.** Adding a unique column prompts for confirmation, which fails in a non-interactive shell. The migration was generated with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` and applied with `prisma migrate deploy`.
- **The one-time verification send can't use `appUrl()`.** Run locally against production, it would read `APP_URL` from the local `.env` (localhost) and email real supporters localhost links. `sendVerifications` takes the site address explicitly, and the script passes the production address.
- **A test of "family members aren't notified" needs a verified family member.** With an unverified one, the verified-only filter hid a missing role filter.

