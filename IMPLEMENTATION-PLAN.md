# Implementation plan: non-admin family members

Bridges `spec/access.md` → "Admins" (and the "Only an admin…" edits throughout `spec/access.md`, `spec/updates.md`, and `spec/MASTER_SPEC.md`) and the current code. One PR.

A family member is an admin or not. Admins manage the family (everything on the People page that changes anything, plus requests to join); a non-admin does everything else a family member does and sees the People page read-only. Existing family members become admins, so nothing changes for any family until an admin turns a switch off.

## Decisions already made

- **A flag, not a new role.** `Person.isAdmin`. A non-admin stays `role: "family"`, so every visibility rule (sees all updates, notes marked "Family", sessions, notifications) is untouched. Nothing that checks `role === "family"` changes.
- **One rule for what's gated:** admins do everything on the People page that changes anything, plus requests to join; non-admins do the rest, including How to help (requests, offers, the family's message) and posting.
- **Non-admins see supporters' email and phone** on a read-only People page.
- **New family members default to non-admin, and the server requires the choice.**

## Cuts (for speed)

- No record of who changed someone's admin status, and non-admins aren't shown who is an admin.
- The operator's `family:create` script makes every member an admin and doesn't ask.
- The preview seed doesn't add a non-admin family member; Melissa makes one with the new add form.

## Schema

`prisma/schema.prisma`, `Person`:

```prisma
  // Family members only. Admins manage the family (see spec/access.md "Admins"); a database
  // check keeps it false for supporters.
  isAdmin          Boolean   @default(false)
```

Hand-written migration `prisma/migrations/20261124010000_family_admins/migration.sql` (sorts after `20261124000000_invite_requests`; check `origin/main` for a same-or-later timestamp before pushing):

1. `ALTER TABLE "Person" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;`
2. `UPDATE "Person" SET "isAdmin" = true WHERE "role" = 'family';` (every existing family member, removed or not, becomes an admin, so a restored one keeps today's powers).
3. `ALTER TABLE "Person" ADD CONSTRAINT "Person_isAdmin_family_only" CHECK (NOT "isAdmin" OR "role" = 'family');` (same style as the phone check; find it in the earlier migrations).

Follow `claude/lessons.md` → "Commands that fail in an agent's shell" for the migration and drift check.

## Server

### The rule: `requireAdmin(person)`

In `server/people.ts` beside `requireFamilyMember`: throws `RequestError(403, "Only admins can do this")` unless `person.role === "family" && person.isAdmin`. `person` always comes from `getSession`, loaded fresh per request, so a demotion applies on the next request with no session change.

Replace `requireFamilyMember` with `requireAdmin` in exactly these places, and nowhere else:

- `server/people.ts`: `addFamilyMember`, `addSupporter`, `setRemoved`, `verifySupporter`, `setPrivacyNotice`, `changeQuestion`, and the management half of `listPeople` (below).
- `server/groups.ts`: all five (`createGroup`, `renameGroup`, `addGroupMember`, `removeGroupMember`, `deleteGroup`).
- `server/notes.ts`: `setAllowNotesByDefault`.
- `server/reactions.ts`: `setNoteReactions`.
- `server/inviteRequests.ts`: `approveInviteRequest`, `declineInviteRequest`.

Stay on `requireFamilyMember`: everything in `server/updates.ts`, `server/photos.ts`, `server/help.ts` (including `setHelpMessage` and `removeOffer`), and note deletion. The post form's group list comes from `newUpdateDefaults` (the updates endpoint), not from `listPeople`, so it keeps working for non-admins: confirm it stays on `requireFamilyMember`.

Inside the two transactions that already re-check the actor (`removeFamilyMember`, and the new `setAdmin` below), re-check `isAdmin` as well, so a request from someone demoted a moment ago is refused.

### `listPeople(db, person)`

Calls `requireFamilyMember` first, then branches on `person.isAdmin`:

- **Admin:** today's result, with `admin: true`, and each family member row gains `isAdmin: boolean`.
- **Non-admin:** only `{ admin: false, familyMembers, supporters }`, where `familyMembers` is `{ id, name, email, isYou }[]` and `supporters` is the non-removed supporters as `SupporterView` today. The query for the other fields (groups, question, answers, requests, removed list, device count, banner, note reactions, notes default) must not run for them, so nothing leaks by accident.

### `addFamilyMember`

New required input `admin`: a boolean, else `RequestError(400, "Choose whether they can manage people and settings.")`, checked before any lookup. `true`/`false` is stored as `isAdmin` on the new, promoted, or restored person. A current family member's `isAdmin` is never touched by this call. Promoted supporters, being family members now, can have `isAdmin` set because the check allows it.

### `setAdmin(db, person, id, admin)` (new, `server/people.ts`)

`requireAdmin(person)`; `admin` must be a boolean (400). In one transaction, take the Family row lock exactly as `removeFamilyMember` does (`SELECT 1 FROM "Family" WHERE id = … FOR UPDATE`); re-check the actor is still an active admin (403 otherwise); update the target (`id`, same `familyId`, `role: "family"`, `removedAt: null`; count 0 → 404); then if the family now has no active admin, throw `RequestError(409, "A family needs at least one admin.")`, rolling back. It works on the actor themselves.

`removeFamilyMember` also counts after its update: if no active admin remains, 409 (it can't normally happen, since the remover is an admin who can't remove themselves, but a demotion that won the lock just before could make the remover a non-admin, which the actor re-check already catches; keep both).

### Notifications

`notifyInviteRequest` (server/inviteRequests.ts) selects only `isAdmin: true` family members who have notifications on and aren't removed. `notifyNewUpdate` is unchanged.

### `personView` and the people routes

- `personView` (`server/http.ts`) gains `isAdmin`. Confirm by grep that it's used only for the signed-in person's own data (`me`, sign-in results), never for another person.
- `api/f/[slug]/people/[id].ts` `PATCH` also accepts `{ admin: boolean }`, alone (exclusive with `removed` and `verified`, as those two are with each other), calling `setAdmin`.
- `api/f/[slug]/people/index.ts` `POST` family-member add passes `admin` through.
- Other handlers need no change: they call the same server functions.

### Seeds and fixtures

`server/families.ts` `createFamily`: members are created with `isAdmin: true`. `scripts/seed-preview.ts`: the test family members are created and upserted with `isAdmin: true` in both the create and update clauses. `tests/integration/fixtures.ts` `makeFamily` goes through `createFamily`, so its members are admins; add `makeNonAdmin(db, family, name)` that adds a family member through `addFamilyMember` with `admin: false` and returns the person.

## Front end

- **`src/api.ts`**: `me.person.isAdmin`.
- **People page** (`src/pages/People.tsx`): the response is `admin: true` (as today, plus `isAdmin` on family member rows) or `admin: false`. For `admin: false`, render only the family member list and the supporter list, read-only: no forms, buttons, removed list, device count, or sections. For admins:
  - each family member row gets an **Admin** switch (a labelled checkbox using the shared `Checkbox`), saving on change through `PATCH people/<id> { admin }`, with the server's 409 shown ("A family needs at least one admin.") and the switch returning to its saved value;
  - the add-family-member form gets **"Can manage people and settings,"** unchecked, sent as `admin`.
- **Notification checkbox** (`src/pages/FamilyHome.tsx`): "Email me about new updates and requests to join" only when `me.person.isAdmin && me.family.inviteOnly`; everyone else "Email me when there's a new update" (as today).
- Nothing else changes: the menu keeps its People link for every family member.

## Tests

Integration tests in a new `tests/integration/admins.test.ts`, with a unit test for the `admin` input validation if it's extracted. Prove each access rule fails with the rule removed (copy the file to the scratchpad first; `claude/lessons.md` → "Patterns that hide a removed access rule"), one `requireAdmin` at a time.

1. **Non-admin refused everywhere that's gated.** For each function in the list above (including `setAdmin`, and approve and decline of a planted request), a non-admin family member gets 403 and nothing changes. Written as a table so each function is a row; the mutation proof removes `requireAdmin` from one function at a time and the matching row fails.
2. **Non-admin allowed everywhere else.** A non-admin can create, edit, and delete an update (including a Family-members-only one on an invite-only family, and one with a photo upload ticket), leave and delete a note, create, edit, resolve, reopen, and delete a help request, set the family's help message, and remove an offer. `newUpdateDefaults` still returns the family's groups to them. They see every update, including those shared with groups they aren't in, and `getSession` still returns them as `role: "family"`.
3. **The read-only People page.** For a non-admin, `listPeople` returns exactly `admin: false`, `familyMembers`, and `supporters` (with phone numbers), and none of: groups, question, answers, requests, removed supporters, device count, privacy notice, note reactions, notes default. Supporters still get 403. For an admin it returns everything plus each family member's `isAdmin`.
4. **At least one admin.** Demoting the only admin is 409 and leaves them an admin. With two admins, A demotes B while B demotes A, made deterministic by holding the Family lock in a test transaction and waiting for both to queue (`queuedOrDone`; the lessons' lock-test pattern): exactly one succeeds, the other is refused, and one admin remains. Same for A removing B while B demotes A. The mutation proof removes the lock, and separately the count check, and each fails every time.
5. **A demotion applies at once.** After an admin is demoted, the same session token is still valid, `getSession` returns a non-admin, and an admin action is refused.
6. **`addFamilyMember` and `admin`.** A missing or non-boolean `admin` is 400 and creates nothing. `true` and `false` are stored for a new, a promoted, and a restored family member. Adding the email of a current family member changes nothing about their `isAdmin`.
7. **Request emails only to admins.** With one admin and one non-admin, both notifying, a stored request emails only the admin. A new update still emails both.
8. **Migration and database check.** After `migrate deploy`, an existing family member (created before the migration in a fixture, or by direct SQL) is an admin and an existing supporter is not; setting `isAdmin` true on a supporter violates the check. (If the existing test setup can't see pre-migration rows, assert the check and `createFamily`'s admins, and prove the `UPDATE` by hand against a scratch database in the PR notes.)
9. **`createFamily`** makes every member an admin.

The existing tests that act as a family member through `makeFamily` stay green unchanged, because `makeFamily` members are admins.

## Order of work (subagents)

Environment is set up as before: Node 24 at `/opt/node24/bin`, Postgres on localhost:5432 (role `dev`), databases `uas_test` (tests), `uas_dev_a` and `uas_dev_b` (builder), `uas_verify` (verifier). Give each subagent the Node path, database names, scratchpad path, and commit trailer.

1. **Builder A, in the main checkout:** schema, migration, everything under Server, fixtures, `tests/integration/admins.test.ts`, and the mutation proofs. Commits its own finished work; I push.
2. **Builder B, in a worktree, in parallel:** Front end, against the API shapes above (`listPeople`'s two forms, `PATCH people/<id> { admin }`, `POST` family-member add with `admin`, `me.person.isAdmin`).
3. **Verifier C, after both:** independent. Greps every `requireFamilyMember` and `requireAdmin` and checks each against the list; checks that nothing outside `listPeople`'s admin branch returns the gated data; re-runs five mutation proofs; browser check at 360px and 1280px of an admin's and a non-admin's People page, the Admin switch, the add form, the last-admin refusal, and a non-admin posting and leaving a note.
4. I check the claims that matter, run `npm run typecheck` and `npm test`, open the PR, and give Melissa the preview steps: add a family member without the checkbox, sign in as them (a `+` address), confirm the People page is read-only and the feed works.
