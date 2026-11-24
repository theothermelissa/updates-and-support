# Implementation plan: request an invite

Bridges `spec/access.md` → "Requesting an invite" (plus the notification checkbox wording and the People page's "Requests to join") and the current code. One PR, sized for one session.

An invite-only family's signed-out page gets a "Request an invite" form. A request is stored in its own table (never as a `Person`), tells the family by email, and waits on the People page until a family member approves it (which adds the supporter exactly as "Add supporter" does) or declines it (which deletes it). Families that aren't invite-only behave exactly as today.

## Decisions already made

- **A request is not a person.** New `InviteRequest` table; no session, no groups, nothing readable.
- **One reply for everything.** `thanks` whoever the email belongs to, and whether or not anything was stored. The only other reply is `closed`, when the family is at its pending cap, which depends on nothing the visitor typed.
- **Approval reuses the supporter-adding code.** No second way to create a supporter.
- **Request emails share `Person.notificationsOn`.** No new setting.

## Cuts (for speed)

- Choosing groups while approving; the family uses the Groups section afterward.
- A badge on the navigation bar for pending requests; the email and the People page are the only signals.
- Bulk decline; expiry clears the stale ones.
- Batching or debouncing the "someone asked to join" email; the network limit and the cap bound it.
- A block list for people who were declined (recorded in the spec's Stated limits).

## Schema

`prisma/schema.prisma`, new model, with a hand-written migration `prisma/migrations/20261124000000_invite_requests/migration.sql` (named to sort after `20261030000000_invite_only`; check `origin/main` for a same-or-later timestamp before pushing):

```prisma
model InviteRequest {
  id        String   @id @default(cuid())
  familyId  String
  name      String
  email     String   // normalized, as Person.email is
  message   String?
  network   String   // networkKey(), for the per-network limit
  createdAt DateTime @default(now())

  family Family @relation(fields: [familyId], references: [id], onDelete: Cascade)

  @@unique([familyId, email])
  @@index([familyId, createdAt])
  @@index([familyId, network, createdAt])
}
```

Add `inviteRequests InviteRequest[]` to `Family`. Follow `claude/lessons.md` → "Commands that fail in an agent's shell" to check there's no drift. Add `"InviteRequest"` to `resetDb` in `tests/integration/fixtures.ts` only if truncating `Family ... CASCADE` doesn't already reach it.

## Server: `server/inviteRequests.ts`

Constants: `NETWORK_LIMIT_PER_HOUR = 5`, `PENDING_CAP = 50`, `EXPIRY = 30 days`, `MESSAGE_MAX = 500`. Name and email validation reuse `validNameAndEmail` from `server/people.ts` (export it if needed).

### `requestInvite(db, send, sendMany, family, client, input): Promise<"thanks" | "closed">`

In this order:

1. Validate `name` (1–100 trimmed), `email`, and `message` (optional string, trimmed, at most 500, empty becomes null). Invalid → `RequestError(400, ...)`. These errors depend only on what was typed.
2. `!family.inviteOnly` → `RequestError(403, "This family isn't invite-only.")`.
3. Delete this family's requests older than 30 days.
4. Count this family's requests; at or over 50 → return `"closed"`. Nothing else happens, whatever the email is.
5. Look up the person by `(familyId, email)`:
   - active (any role) → call `requestSignInLink(db, send, family.slug, email)` (which keeps its own 5-an-hour-per-email limit) and return `"thanks"`;
   - removed → return `"thanks"`, nothing sent.
6. Count requests from `client.network` in this family in the last hour; at or over 5 → `"thanks"`, nothing stored.
7. `create` the request. A unique violation (`P2002`, a request for this email already pending, or one made a moment ago) → `"thanks"`, and no email.
8. After a successful create, email the family (below). A failed email is logged and swallowed, as `addSupporter`'s is. Return `"thanks"`.

The cap and network limit are plain counts without a lock: two simultaneous requests can exceed either by one or two, which is harmless.

### Telling the family

`notifyInviteRequest(db, sendMany, family)`: the family's family members with `removedAt: null`, an email, and `notificationsOn: true` each get `inviteRequestEmail(...)` from `server/email.ts`:

- subject `Someone asked to join ${familyName}`;
- body names the family, says someone asked to join, links to `${appUrl()}/f/${slug}/people`, and links to turn notifications off, with `List-Unsubscribe` headers, built exactly as `notifyNewUpdate` builds them;
- **no name, email, or message of the requester.**

### Listing, approving, declining

All three call `requireFamilyMember(person)` first.

- `listInviteRequests(db, person)`: this family's requests, oldest first, `{ id, name, email, message, createdAt }`, only for an invite-only family (empty otherwise); expired ones are filtered out by `createdAt` in the query.
- `approveInviteRequest(db, send, person, id)`: in one transaction, (a) `deleteMany({ where: { id, familyId: person.familyId, createdAt: { gt: <30 days ago> } } })`, count 0 → `RequestError(404, "That request is gone.")`; (b) look up `(familyId, email)`: if a person exists (supporter, family member, or removed), return `{ added: false, reason: "supporter" | "family" | "removed" }` and keep the delete; (c) otherwise create the supporter and welcome link as `addSupporter` does. After the transaction commits, send the invite-only welcome email with the 7-day sign-in link (a failed email is logged, not thrown) and return `{ added: true }`. To share the code, split `addSupporter` into a function that creates the supporter and its link inside a given transaction, and the part that sends the email; `addSupporter` keeps its behavior and its tests.
- `declineInviteRequest(db, person, id)`: `deleteMany` with the same `id` and `familyId` filter; count 0 → 404. Sends nothing.

Because (a) happens before (c) in one transaction, a decline and an approve of the same request can't both win, and two approves can't both create.

### Wiring

- `server/people.ts` `listPeople`: add `inviteRequests` to its result, from `listInviteRequests`.
- `server/email.ts`: `inviteRequestEmail`.
- `api/f/[slug]/invite-requests/index.ts`: `POST`, no session. Uses `familyContext` and `clientOf` as `gate.ts` does, calls `requestInvite`, replies `200 { result: "thanks" | "closed" }`; errors go through `sendRequestError`.
- `api/f/[slug]/invite-requests/[id].ts`: `POST` approves (`200 { added: true } | { added: false, reason }`) and `DELETE` declines (`200 { ok: true }`), both for a signed-in family member, shaped like `api/f/[slug]/people/[id].ts`.
- Restart `npm start` after adding API files (`claude/lessons.md`).

## Front end

- **Signed-out page** (`src/pages/Gate.tsx`, `InviteOnlyGate`): a "Request an invite" link under the email box swaps the page's card for the request form: name, email, optional message (a textarea, with a 500-character limit shown), "Send request" and "Back." `thanks` replaces the form with "Thanks. If the family approves, you'll get an email at that address." `closed` shows "Requests are closed right now. Please contact the family." A 400 shows its message. No `confirm()` or `alert()`.
- **People page** (`src/pages/People.tsx` and a new `src/components/inviteRequests.tsx`): "Requests to join" above the supporter lists, drawn only when there are requests. Each shows name, email, message (as text), and when it was made, with Approve and Decline. Decline asks "Yes / Cancel" inline. After either, reload the page's data. For `added: false`, say so in the section's message line ("That person is already a supporter," and so on).
- **Notification checkbox** (`src/pages/FamilyHome.tsx`): family members of an invite-only family see "Email me about new updates and requests to join." Everyone else keeps the current label. Check that `me` already carries `inviteOnly`; add it to `api/f/[slug]/me.ts` if not.

## Tests

Integration tests against real Postgres, in a new `tests/integration/inviteRequests.test.ts`, plus a small unit test for input validation. Each access test gets its rule removed to prove it fails (copy the file to the scratchpad first; `claude/lessons.md` → "Patterns that hide a removed access rule").

1. **Stored, and the family told without the details.** A request for an unknown email stores one row, and emails only family members with notifications on and not removed. The email's subject and body contain none of the name, email, or message. No supporter is emailed.
2. **No leak between cases.** For an active supporter, a family member, a removed supporter, a removed family member, and an unknown email, `requestInvite` returns `"thanks"` each time. Only the unknown one stores a row. Active people get a sign-in link and email; removed people get neither a row, a link, nor an email.
3. **Duplicate.** A second request for the same email stores nothing new and sends no second family email.
4. **Network limit.** The sixth stored request from one network in an hour stores nothing and still replies `"thanks"`; another network is unaffected; rows older than an hour don't count.
5. **Cap and expiry.** With 50 pending, `"closed"` comes back, nothing is stored, nothing is emailed, and a current member's email gets no sign-in link either. A request 31 days old is deleted by the next request and doesn't count toward the cap, and `listInviteRequests` and `approveInviteRequest` treat an expired row as gone.
6. **Only invite-only families.** On a family with a community question, `requestInvite` throws 403 and stores nothing.
7. **Who may act.** A supporter, a family member of another family, and a request id from another family each fail (403 or 404) for list, approve, and decline, and change nothing. `listPeople` for a supporter-facing call and for a non-invite-only family returns no requests.
8. **Approve.** Creates one supporter in Everyone with no groups, with a 7-day `sign_in` link and the invite-only welcome email, deletes the request, and the supporter can sign in with the link. When the email has since become a supporter, a family member, or a removed person, nothing about them changes, the request is deleted, and the reason is returned.
9. **Approve and decline race.** Decline then approve of the same request → 404 and no `Person`. Two simultaneous approves → one `added: true`, one 404, and one `Person`.
10. **Decline.** Deletes the request and sends no email.
11. **Validation.** Name length, a bad email, and a message over 500 characters each give 400 and store nothing.

The existing `addSupporter` tests must still pass unchanged.

## Order of work (subagents)

1. **Builder A, in the main checkout:** schema and migration, `server/`, `api/`, and the integration and unit tests, then the mutation proofs. It commits its own finished work.
2. **Builder B, in a worktree, in parallel:** `src/` against the API shapes above. It can't run the server's tests; it type-checks against the shapes.
3. **Verifier C, after both:** independent. Audits that nothing but `listPeople`, `listInviteRequests`, and the People page carries a request's fields; re-runs the mutation proofs; checks the browser flow at 360px and desktop in its own worktree with its own databases.
4. I check the claims that matter, run `npm run typecheck` and `npm test`, open the PR, and give you the preview steps.

Give each subagent the Node path, database names, scratchpad path, and commit trailer, and have them cherry-pick across worktrees as `claude/lessons.md` → "Delegating a feature to subagents" says.
