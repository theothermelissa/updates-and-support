# Implementation Plan — Groups and update audiences

A family sorts supporters into groups on the People page and shares an update with everyone or with one or more groups. A supporter outside an update's audience can't tell it exists. The spec is `spec/access.md` ("Groups") and `spec/updates.md` ("Audience", plus the audience rules in the feed, Post settings, editing, reactions, notes, the wall, and notifications).

## Slices

The work ships as two PRs. Each leaves production fully working, and neither can show a group update to anyone outside its audience.

**Slice 1: audiences.** The whole schema, one visibility rule enforced at every read and write that names an update or a note, audience on post and edit (server and Post settings), the family member's audience label in the feed, notification recipients, and promotion leaving groups. It is the privacy-critical half, so it lands, with its tests, before anything can put a supporter in a group.

Slice 1 is invisible in production. No family has a group until slice 2, so "Who can see this" never shows and every update stays "Everyone." Integration tests create groups by inserting rows directly. The Post settings UI is checked in a local browser against a group inserted by a scratchpad script; the preview is checked for regressions only.

**Slice 2: managing groups.** The People page's Groups section: create, rename, add and remove members, and delete with reassignment, plus the server functions and endpoints behind it. Its only migration drops the default on `audience` (see "How it's stored"). Once it merges, families can use the feature.

This split puts all enforcement in one reviewable PR, so slice 2 adds only new ways to change group rows, each of which the slice 1 rule already handles. The alternative, with all UI in slice 2, makes slice 1 smaller but slice 2 too large for one session.

## How it's stored

```prisma
enum Audience {
  everyone
  groups
}

model Update {
  // ...existing fields
  // Who can see it, besides family members, who see every update. `groups`: supporters in at
  // least one of its UpdateGroup rows. `groups` with no rows left is "Family members only".
  // Every create in server/ names it. (Slice 1 keeps a default of `everyone`; slice 2 drops it.)
  audience Audience @default(everyone)
  groups   UpdateGroup[]
}

// A family's named set of supporters. Names are unique per family ignoring capitals, which
// server/groups.ts enforces under the family's groups lock.
model Group {
  id        String   @id @default(cuid())
  familyId  String
  name      String
  createdAt DateTime @default(now())

  family  Family        @relation(fields: [familyId], references: [id], onDelete: Cascade)
  members GroupMember[]
  updates UpdateGroup[]

  @@index([familyId])
}

model GroupMember {
  groupId  String
  personId String
  group  Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  person Person @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@id([groupId, personId])
  @@index([personId])
}

model UpdateGroup {
  updateId String
  groupId  String
  update Update @relation(fields: [updateId], references: [id], onDelete: Cascade)
  group  Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([updateId, groupId])
  @@index([groupId])
}
```

Plus back-relations on `Family.groups` and `Person.groupMemberships`.

**Why this shape.** "Family members only" isn't stored as its own value: it is `groups` with no rows. Deleting a group cascades its `UpdateGroup` rows, so an update whose only group is deleted becomes family-only by the database alone. Deletion can narrow an audience but never widen one, even if the reassignment code is wrong. The post form never sends family-only, and the server refuses `groups` with an empty list, so the only way an update reaches it is a group deletion.

**The default on `audience`, in two steps.** In the end `audience` has no default, so Prisma requires it in every `update.create` and the type checker catches a create that forgets it. It can't start that way. Vercel runs `prisma migrate deploy` during the build, so the old code serves production against the new schema for a minute or two. If the build then fails, it keeps serving until a fix ships. Old code doesn't send `audience`, so without a default every post it makes would fail.

A database default of `everyone` with no `@default` in the Prisma schema would avoid that outage. But Prisma compares column defaults when diffing, so the drift check, and any later `migrate dev`, would see the mismatch and generate `DROP DEFAULT`. Instead:

- **Slice 1** adds the column with `@default(everyone)` in both the schema and the database. Old code only ever posts to everyone, so the default never widens an audience, and no group exists while old code can run. Every create in slice 1's `server/` passes `audience` explicitly, and test 9 fails if the text or video post path doesn't apply the audience it was given.
- **Slice 2** removes `@default(everyone)` and adds a migration that runs `ALTER TABLE "Update" ALTER COLUMN "audience" DROP DEFAULT`. Slice 1's code, the old code during that deploy, always sends `audience`, so nothing breaks.

Slice 1's migration:

```sql
CREATE TYPE "Audience" AS ENUM ('everyone', 'groups');
ALTER TABLE "Update" ADD COLUMN "audience" "Audience" NOT NULL DEFAULT 'everyone';
-- then CREATE TABLE "Group", "GroupMember", "UpdateGroup", their indexes and foreign keys,
-- each ON DELETE CASCADE, as `prisma migrate diff` generates them.
```

The folders are `prisma/migrations/20261028000000_groups/` and `prisma/migrations/20261029000000_audience_no_default/`, unless `origin/main` has a migration at or after those timestamps by then. Check each for drift as `claude/lessons.md` describes. Raw SQL always quotes `"Group"`, which is a reserved word.

Two tests create updates directly with `db.update.create` and need `audience` once the default is gone: `tests/integration/updates.test.ts` (around line 124) and `tests/integration/people.test.ts` (around line 535). Slice 2 adds `audience: "everyone"` to both.

**Rolling back.** Once any update has a group audience, rolling production back to code from before slice 1 would show that update to everyone. After slice 2 ships, fix forward instead. Rolling back from slice 2 to slice 1 is safe.

**The groups lock.** `lockGroups(tx, familyId)` in `server/audience.ts` takes `pg_advisory_xact_lock(hashtext('groups:' || familyId))`. Every write to a family's groups, or to an update's audience, takes it first, before any row lock: posting or editing with an `audience`, and every slice 2 group operation. This serializes audience writes with group deletion. Without it, an edit that drops group G from update U could commit while `deleteGroup` still sees U as shared only with G, and the deletion would then share U with a group nobody chose for it. Taking the lock first, before `editUpdate`'s `FOR UPDATE`, keeps the lock order the same everywhere, so it can't deadlock.

## The visibility rule

New file `server/audience.ts` holds the rule and its inverse, side by side, and nothing else re-states it:

```ts
// The updates this person may see. Family members see every update in their family. A supporter
// sees those shared with everyone, and those shared with a group of their own family that they
// belong to while their email is verified and they aren't removed. Read from the database on
// every call, never from the session's copy of the person.
export function visibleUpdates(person: Person): Prisma.UpdateWhereInput {
  if (person.role === "family") return { familyId: person.familyId };
  return {
    familyId: person.familyId,
    OR: [
      { audience: "everyone" },
      {
        audience: "groups",
        groups: { some: { group: { familyId: person.familyId, members: { some: {
          personId: person.id,
          person: { emailVerifiedAt: { not: null }, removedAt: null },
        } } } } },
      },
    ],
  };
}

// The exact inverse: the people who match visibleUpdates for this loaded update. Everyone in the
// family for `everyone`; otherwise family members, and verified, active members of one of its
// groups (in this family). Callers add their own conditions, such as notifications' guards.
export function canSeeUpdate(update: { familyId: string; audience: Audience; groupIds: string[] }): Prisma.PersonWhereInput
```

The membership clause doesn't check the member's role or family: `getSession` re-reads the person on every request, and promotion deletes memberships. It does check `emailVerifiedAt` and `removedAt` on the database row, since the spec makes those conditions of the grant. `group.familyId` stays, so a membership row pointing at another family's group grants nothing.

Callers combine it with their own conditions as `{ AND: [{ id }, visibleUpdates(person)] }`, never by spreading, so a caller's own `OR` can't silently replace it.

The same file has:

- `parseAudience(input)`: absent is `undefined`; `"everyone"`; or `{ groups: string[] }` with 1 to 50 distinct strings. Anything else is a 400.
- `lockGroups(tx, familyId)`: see "The groups lock."
- `writeAudience(tx, familyId, updateId, audience)`: called after `lockGroups`. It checks that every group id belongs to `familyId` (`tx.group.count({ where: { id: { in: ids }, familyId } })`), refusing with `GROUP_GONE`. Then it replaces the update's `UpdateGroup` rows and sets `Update.audience`.
- `GROUP_GONE`: a 409 with "A group you chose was deleted. Please choose again." Another family's group, an unknown id, and a group deleted while the form was open all get it. No foreign-key mapping is needed. Group deletion takes the same lock, so it either committed before the count, which then sees the group missing, or it waits until this transaction commits. Under Read Committed, each statement sees everything committed before it starts.
- `audienceView(update)`: `"everyone"`, or `{ groups: { id, name }[] }` sorted by name, where an empty list means family members only. Only family members ever receive it.

### Every call site

Each must use the rule, or is listed with the reason it doesn't need to.

| Where | What it does | Change |
|---|---|---|
| `server/updates.ts:listUpdates` | The feed, the live check (the feed polls the same `GET /updates`), the wall's naming of a filtered update (it reads the feed), photo links (`withPhotoLinks`), video update links (`view` → `shownVideo`), update reactions and who reacted (`reactionsView`), and notes under each update | `where: visibleUpdates(person)`. **Only when `person.role === "family"`**, include `groups.group` and add `audience: audienceView(u)` to each item; for supporters the groups aren't loaded and the key is absent |
| `server/notes.ts:visibleNotes` | The shared note filter | Takes the `Person`, and becomes `{ update: visibleUpdates(person), author: { familyId, removedAt: null } }` |
| ↳ `server/updates.ts:listUpdates` (notes include) | Notes under each update | Passes `person` (redundant with the update filter, but keeps one definition) |
| ↳ `server/notes.ts:listNotes` | The wall: notes, note video links (`noteView` → `shownVideo`), note reactions and who reacted | Passes `person` |
| ↳ `server/notes.ts:deleteNote` | Deleting a note, own or (family) any | Passes `person`, so a supporter's own note on an update they can't see is "Note not found" |
| ↳ `server/reactions.ts:setReaction` (note branch) | Reacting to a note, or clearing it | Passes `person` |
| `server/reactions.ts:setReaction` (update branch) | Reacting to an update, or clearing it | `findFirst({ where: { AND: [{ id: updateId }, visibleUpdates(person)] } })`. It already runs before the reaction-set check, so an out-of-audience update can't answer "That reaction isn't available here" |
| `server/notes.ts:createNote` | Leaving a note | After the existing `FOR SHARE` lock, `tx.update.count` with `visibleUpdates`; zero is "Update not found" (404). **It must come before the `allowNotes` 403 and the 429 rate limit**, which would otherwise reveal the update. The earlier body, color, and video checks don't depend on the update, so they answer the same for a missing and a hidden one |
| `server/notifications.ts:notifyNewUpdate` | Recipients of the new-update email | Takes the update's id and loads its `familyId`, `audience`, and group ids. Recipients are `{ AND: [canSeeUpdate(loaded), <today's guards>] }`. Today's guards (`notifications.ts` lines 25–31) stay unchanged: `id: { not: authorId }`, `email: { not: null }`, `OR: [{ role: "family" }, { emailVerifiedAt: { not: null } }]`, `notificationsOn: true`, and `removedAt: null`. These matter beyond the audience: `canSeeUpdate` doesn't check removal or verification for everyone-updates or for family members, and a removed family member keeps `notificationsOn` |
| `server/updates.ts:createUpdate`, `createVideoUpdate` | Posting | `parseAudience` (absent is everyone), and `audience` passed explicitly on the create. With groups: `lockGroups` first in the transaction (before `createVideoUpdate`'s author lock), then `writeAudience`. Then `notifyNewUpdate(update.id, …)` |
| `server/updates.ts:editUpdate` | Editing | An absent `audience` keeps the update's current one, including family-only, and takes no groups lock. When present, `lockGroups` comes first in the transaction, before the `FOR UPDATE` on the update, then `writeAudience`. A video update is already refused |
| `server/updates.ts:newUpdateDefaults` | The post form's starting values, family members only | Adds `groups: { id, name }[]` sorted by name |
| `server/people.ts:addFamilyMember` | Promotion | Deletes the person's `GroupMember` rows in the same transaction |

Already safe and unchanged:

- `deleteUpdate`, `editUpdate`'s other paths, `issuePhotoUpload`: family members only, and family members see every update.
- `issueVideoUpload`, `claimVideo`, `lockUnusedVideo`: name no update, and only answer about the caller's own tickets.
- `server/help.ts`, `api/f/[slug]/me.ts`: requests and the family's message are never shared with groups.
- `noteSelect` / `visibleReactors`: filter reactors by family within notes and updates that are already filtered.

There is no single-update endpoint. Supporters reach updates only through `GET /updates`, and the wall names its filtered update from the same list, so a filter to a hidden update shows exactly what it shows for a deleted one, with no change to `src/pages/Wall.tsx`. The live feed's `applyFetched` already counts an update that newly appears as waiting, and drops one that disappears.

### API shapes

- `POST /updates` and `PATCH /updates/:id` accept `audience: "everyone" | { groups: string[] }`. Absent on a post means everyone, which keeps pages loaded before the deploy working. Absent on an edit keeps the current audience.
- `GET /updates`: for a family member, each update has `audience` and `defaults` has `groups`. For a supporter, there's no `audience` key, and `defaults` stays `null`.
- Slice 2: `GET /people` adds `groups`; `POST /groups` creates one; `PATCH /groups/:id` takes one of `{ name }`, `{ add: personId }`, or `{ remove: personId }`; `DELETE /groups/:id` takes `{ moveTo: string[] }`, where empty means family members only.

## Tests

Integration tests against Postgres, in `tests/integration/audience.test.ts` (slice 1) and `tests/integration/groups.test.ts` (slice 2).

**Fixtures** (`tests/integration/fixtures.ts`): `makeGroup(db, familyId, name, memberIds)` inserts rows directly. `verifiedSupporter(db, family, name)` joins with an email, then verifies it with `verifySupporter`. `resetDb` needs no change, since truncating `Family` cascades to the new tables.

**The cast** (Rivera family): Ana and Ben, family members. Fay is a family member who has been removed and still has notifications on. Gia is verified and in Neighbors. Pia is verified and in Neighbors, and reacts only to N. Hal is verified and in Investors. Uma is in Neighbors but unverified. Rae is verified and in Neighbors, and is removed during a test. Ned answered the question and has nothing else. The Okafor family has its own Neighbors group with Olu, who is verified. Rivera updates: E, shared with everyone; N, with Neighbors; NI, with Neighbors and Investors; F, family-only, made by inserting `audience: groups` with no rows.

**Rules for every access test.** These keep a test from passing with its rule removed:

- Every "can't" has a positive control on the same call: the same id succeeds for someone in the audience, and the same person succeeds on an update they can see. `joinWithEmail` makes *unverified* supporters, so a group test built on it would pass with the group rule deleted. Members use `verifiedSupporter`.
- A not-found is compared with the error for an id that doesn't exist (`toEqual` on status and message), not only with 404.
- A removed member is tested by calling the server function with the stale `Person` from before removal, because `getSession` already refuses a removed person and would hide a missing `removedAt` condition.
- Notification tests assert the exact recipient list, including the people who must get it.
- Leak tests search the JSON for strings that the positive control's JSON does contain (group names, photo and video public ids).

### Slice 1: `audience.test.ts`

1. **Who sees what.** Each person's `listUpdates` ids are exactly: Ana and Ben {E, N, NI, F}; Gia and Pia {E, N, NI}; Hal {E, NI}; Uma {E}; Ned {E}; Olu only Okafor's. *Fails when:* the `audience: "everyone"` branch matches everything, the membership branch is dropped, or the `familyId` filter is dropped.
2. **Unverified member.** Uma doesn't see N; after `verifySupporter`, the same call shows N. *Fails when* the `emailVerifiedAt` condition is removed.
3. **Removed member.** Rae sees N. After `setRemoved`, `listUpdates` with her stale `Person` doesn't show N. After restoring, she sees N again, because membership was kept. *Fails when* the `removedAt` condition is removed, or when removal deletes memberships.
4. **Membership is read on every request.** After Gia's `GroupMember` row is deleted, her next `listUpdates` is exactly {E}, while Hal still sees NI.
5. **A cross-family group grants nothing.** Two rows are inserted directly and together: a `GroupMember` row putting Hal in Okafor's Neighbors group, and an `UpdateGroup` row linking Rivera's N to that same group. Hal still doesn't see N. *Fails when* the `group.familyId` condition is removed. This guards against corrupted data, as the photo test for rows inserted for another family does.
6. **Not found everywhere, for Hal on N.** Each refusal matches the error for a nonexistent id (status and message):
   - `setReaction` on N, with a kind and with `null`. *Control:* Gia's identical calls succeed.
   - `setReaction` on Gia's written note on N. *Control:* Gia's own reaction to it succeeds.
   - `createNote` on N. *Control:* Gia's identical call succeeds.
   - `createNote` on N with N's `allowNotes` false: Hal still gets the not-found. *Control:* Gia gets the 403 "Notes are turned off," which proves visibility is checked before `allowNotes`.
   - `createNote` on N with Hal at the hourly limit (20 notes on E in the last hour): Hal gets the not-found. *Control:* Hal's next note on E is the 429, which proves visibility is checked before the rate limit.
   - `deleteNote` on Hal's *own* note on N, which he left while N was shared with Investors, before an edit narrowed N to Neighbors. The note survives. *Control:* Hal deletes his own note on NI, which he can see.
   - `listNotes`: Hal's wall leaves out every note on N. *Control:* Gia's includes them.

   *Each fails when* its call site's rule is removed. The `allowNotes` and rate-limit cases also fail when the visibility check moves after the check it must precede.
7. **Nothing hidden leaks into a supporter's JSON.**
   - **Setup:** N has a body containing a unique string, and a real photo (with a fake Cloudinary config, as in `photos.test.ts`). A video update V is shared with Neighbors. Gia left a written note on N with a unique body, and a video note on N. Pia reacted to N.
   - **Searched:** Hal's `JSON.stringify` of `listUpdates` and `listNotes`, and Hal's `GET /updates` and `GET /notes` responses through the handlers.
   - **Contains none of:** N's id, N's unique body string, N's photo public id, V's video id, the written note's body, the video note's id, Pia's name, "Neighbors", or the key `"audience"`.
   - **Control:** Gia's responses contain every one of those strings except "Neighbors" and `"audience"`.
   - **Also:** both supporters' `GET /updates` has `defaults: null`, while Ana's has the groups and each update's `audience`.
8. **Family members see every audience.** Ana's feed has N's audience as `{ groups: [Neighbors] }`, NI's with both names sorted, F's as `{ groups: [] }`, and E's as `"everyone"`.
9. **Posting and editing audiences.** Posting with Neighbors stores it, and Hal doesn't see it. A video update posted with Neighbors behaves the same. `{ groups: [] }`, a non-list, and a repeated id are 400s. An edit with no `audience` keeps family-only F as family-only. An edit to `"everyone"` shows the update to Ned and Uma; an edit to Neighbors hides it from Hal. Only a family member may set an audience (a supporter's post or edit is 403, as today).
10. **Another family's group is refused.** Posting or editing with Okafor's Neighbors id is `GROUP_GONE`, and nothing is stored or changed. Assert first that the group exists. *Fails when* `writeAudience`'s `familyId` condition is removed.
11. **Notifications go to the audience only.** Posting N with notify emails exactly Ben, Gia, and Pia. It doesn't email Ana (the author), Fay (a removed family member still opted in), Uma (unverified), Hal, Rae (removed), Ned (no email), or Olu. Posting E emails Ben, Gia, Pia, and Hal, and still not Fay. The video update follows the same rule. An edit widening N to everyone sends nothing. No email's subject or text contains a group name. *Fails when* the audience condition in `canSeeUpdate` is removed, or when `notifyNewUpdate`'s `removedAt` guard is removed (Fay).
12. **The two directions agree.** For every person in the cast and every update, "the update is in `listUpdates(person)`" equals "the person matches `canSeeUpdate(update)`". This is what keeps the two clauses from drifting. Removed people are included, with their stale `Person`; both clauses treat them alike.
13. **Promotion leaves every group.** Promoting Gia leaves her with no `GroupMember` rows, and as a family member she sees F.

The groups lock's race test is in slice 2 (test 5), since only group deletion competes with an audience write.

### Slice 2: `groups.test.ts`

1. **Only this family's family members manage groups.** A supporter gets 403 on create, rename, add, remove, delete, and `GET /people` (as today). Okafor's family member gets 404 on each Rivera group id, the same as for a nonexistent one, and Rivera's groups are unchanged.
2. **Who can be added.** An unverified listed supporter can be added (and sees nothing until verified). Refused as "Person not found": a removed supporter, a supporter with no email, a family member, and another family's supporter. Adding someone already in the group changes nothing. *Each fails when* its condition is removed from `addGroupMember`'s filter.
3. **Taking access away.** Removing Gia from Neighbors hides N on her next request, while E stays.
4. **Deleting never widens.** For each case, take every cast member's visible set before and after, and assert after ⊆ before for every supporter:
   - NI loses Neighbors and keeps Investors: Gia no longer sees it, Hal still does.
   - N, with the default `moveTo: []`, becomes family-only: Ana sees it labelled family-only, and no supporter sees it.
   - N with `moveTo: [Investors]`: Hal now sees it, and Gia doesn't. This one *widens* to Hal by the family's choice, so it asserts Hal's set equals before plus N, and Gia's set ⊆ before.
   - A video update shared only with Neighbors is reassigned the same way.
   - `moveTo` naming the group being deleted, another family's group, or an unknown id is refused, and nothing changes: the group, its members, and every audience.
   - Nothing is emailed.
5. **An edit and a deletion at the same moment.** The family also has a third group, Cousins. An update U is shared with Neighbors only. A Prisma query extension, as in the magic-link removal race in `auth.test.ts`, pauses `editUpdate` (U: Neighbors → Investors) right after it replaces U's `UpdateGroup` rows, before it commits. The test then starts `deleteGroup(Neighbors, moveTo: [Cousins])`, waits until it's queued on a lock (`queuedOrDone`, checking advisory and then transactionid waits), and releases the edit. Both finish, and U is shared with Investors only. *Fails when* `lockGroups` is removed from either side. The deletion then reads U as shared only with Neighbors, waits on the edit's row lock, and adds Cousins after the edit commits. That shares U with a group nobody chose for it.
6. **The People page's groups.** `listPeople` returns each group with its members, marked `emailVerified` and `removed`, and `onlyHere`, the count of updates shared only with that group (for Neighbors with the cast above: N and V, not NI or F).
7. **A post naming a deleted group.** After the group is deleted, posting with it is `GROUP_GONE`, and nothing is stored.
8. **Names.** Names are trimmed and 1 to 50 characters; a duplicate ignoring capitals is refused, on create and on rename; a 51st group is refused.

**Not tested automatically:** the Post settings audience section, the feed label, and the People page's Groups section. These are checked by hand in a browser (see each slice's last step).

## Steps

Steps marked **[subagent]** can be checked or done by a subagent independently, given this plan and the named files. Mutation proofs change source files, so a subagent doing them works in its own `git worktree`.

### Slice 1

1. **Schema and migration.** `prisma/schema.prisma`, `prisma/migrations/20261028000000_groups/migration.sql`. Generate the SQL with `prisma migrate diff` against a scratch database, and confirm no drift. **[subagent]** review: the SQL matches the schema, every new foreign key cascades, existing updates become `everyone`, and raw SQL quotes `"Group"`.
2. **The rule.** New `server/audience.ts` with `visibleUpdates`, `canSeeUpdate`, `parseAudience`, `lockGroups`, `writeAudience`, `GROUP_GONE`, and `audienceView`.
3. **Fixtures and the read-side tests.** `tests/integration/fixtures.ts` (`makeGroup`, `verifiedSupporter`), and tests 1–7 in `tests/integration/audience.test.ts`. They fail at this point, which proves the fixtures don't satisfy them by accident.
4. **Enforce on reads and writes.** `server/updates.ts:listUpdates`; `server/notes.ts` (`visibleNotes(person)`, `listNotes`, `deleteNote`, `createNote`); `server/reactions.ts:setReaction`. Tests 1–7 pass.
5. **Audit the call sites.** **[subagent]** Grep `server/` and `api/` for every `db.update`, `tx.update`, `db.note`, `tx.note`, `reaction`, `noteReaction`, `photo`, and raw `"Update"` or `"Note"` query, and confirm each uses `visibleUpdates`, `visibleNotes`, or is family-only, against the table above. Report any miss.
6. **Prove the read-side tests.** **[subagent]** For each "fails when" in tests 1–7, copy the source file to the scratchpad, remove the condition, run that test and watch it fail, and restore. Record the results in this plan.
7. **Audience on post and edit.** `server/updates.ts` (`createUpdate`, `createVideoUpdate`, `editUpdate`, `newUpdateDefaults`), with `lockGroups` first in each transaction that writes an audience. Tests 8–10 pass, and the mutation proof for test 10.
8. **Notifications.** `server/notifications.ts:notifyNewUpdate` and its two callers, keeping today's guards. Tests 11–12 pass, and the proofs for test 11 (audience condition and `removedAt` guard).
9. **Promotion.** `server/people.ts:addFamilyMember`. Test 13 passes, and its proof.
10. **Post settings and the label.** `src/components/postSettings.tsx`: optional `groups` and `audience` props. A "Who can see this" section first, shown when `groups.length > 0` or the audience isn't everyone. It uses native radio buttons: Everyone; Only these groups, with a checkbox per group; and Family members only, offered only while it's the update's current audience. The audience is the first icon: lucide `UsersIcon` for Everyone, `LockIcon` otherwise, with the spec's screen-reader labels. While the audience is groups, the notify checkbox reads "Notify these groups by email", and its bell is heard as "Emails these groups". `src/pages/Feed.tsx`: the post form's audience state, reset after posting; Post is disabled while "Only these groups" has none checked. Editing starts from `update.audience`, and sends `audience` only when it changed. Family members see the muted "Shared with …" or "Family members only" line under the author and time. **[subagent]** can build this in a worktree in parallel with steps 4–9, since the API shape is fixed above.
11. **Check by hand.** Locally, with the scratchpad server described in `claude/lessons.md`, run a scratchpad script that inserts a group with a test supporter. Then check: the section, icon, and label; posting to a group; that a supporter's tab doesn't show the update; editing to Everyone, after which the "1 new update" button appears for the supporter; and that a family without groups looks exactly as before. On the preview: a regression pass of posting, editing, notes, reactions, and the wall, with no "Who can see this" shown.
12. **Ship.** `npm run typecheck`, `npm test`, open the PR, wait for CI, and send the preview link.

### Slice 2

1. **Drop the `audience` default.** Remove `@default(everyone)` from `prisma/schema.prisma`, and add `prisma/migrations/20261029000000_audience_no_default/migration.sql` with `ALTER TABLE "Update" ALTER COLUMN "audience" DROP DEFAULT`. Add `audience: "everyone"` to the direct creates in `tests/integration/updates.test.ts` and `tests/integration/people.test.ts`. The type checker now flags any create that forgets it.
2. **Server.** New `server/groups.ts`: `createGroup`, `renameGroup`, `addGroupMember`, `removeGroupMember`, and `deleteGroup`.
   - Each starts with `requireFamilyMember`, then `lockGroups`, and finds the group by `{ id, familyId }`, so another family's group is a 404.
   - Because every group write and every audience write holds the lock, none of them can hit a foreign key on a group deleted mid-transaction.
   - Create and rename check the 50-group cap and the case-insensitive name under the lock.
   - `addGroupMember` also locks the person row `FOR UPDATE`, so a promotion at the same moment takes turns with it. It accepts only `{ familyId, role: "supporter", email: not null, removedAt: null }`.
   - `deleteGroup`, in one transaction after the lock:
     - validates `moveTo`: this family's groups, not this group, distinct;
     - finds the updates shared only with this group: `{ familyId, audience: "groups", groups: { some: { groupId }, every: { groupId } } }`;
     - locks those update rows with `SELECT id FROM "Update" WHERE id = ANY(…) FOR UPDATE`, so an update deleted meanwhile drops out instead of failing the insert's foreign key;
     - adds the `moveTo` rows to the updates still there, and deletes the group.
3. **People data.** `server/people.ts:listPeople` adds `groups: { id, name, members: { id, name, email, emailVerified, removed }[], onlyHere }[]`, sorted by name.
4. **Endpoints.** `api/f/[slug]/groups/index.ts` (POST) and `api/f/[slug]/groups/[id].ts` (PATCH, DELETE). Thin handlers, like `people/[id].ts`.
5. **Tests.** `tests/integration/groups.test.ts`, tests 1–8, each access test proven against its rule. **[subagent]** can do the mutation proofs in a worktree.
6. **People page.** `src/pages/People.tsx`, in a Groups card after the removed supporters:
   - a create form;
   - per group, the name with a Rename control, members by name and email with "Not verified" and "Removed" tags, and a Remove button that acts at once;
   - an add-member `<select>` of listed, active supporters not yet in the group;
   - Delete, which reloads the people data, then shows the inline `Confirm`. When `onlyHere > 0`, it reads "N updates are shared only with X" and offers a radio, Family members only (the default) or Other groups, with checkboxes for the other groups.
7. **Stale groups in the post form.** `src/pages/Feed.tsx`: when a post or save returns 409, reload the feed so the group checkboxes are current, and keep the draft.
8. **Check by hand and ship.** On the preview, as the test family member, with a second `+` address as a supporter: create two groups, add the supporter, post to one group, and check the supporter sees it and doesn't see a post to the other. Remove them from the group and check it's gone on their next check. Delete a group with each audience choice and check the labels. Then typecheck, test, open the PR, and send the preview link.

## What we're cutting

- **The `audience` default is dropped in two steps.** Slice 1 keeps `@default(everyone)`, so old code can still post during the deploy, or for longer if a build fails after migrating. Slice 2 drops it. Until slice 2 ships, nothing but tests and review stop a new create from forgetting `audience`.
- **An update deleted during a group deletion isn't tested.** `deleteGroup`'s `FOR UPDATE` on the updates covers it, and the worst outcome without it is a failed deletion that can be retried.
- **Group names are unique only by server check, under a lock.** There's no case-insensitive unique index, which would need an expression index that Prisma's schema can't describe. Names aren't a privacy rule.
- **No race tests for names or the 50-group cap.** The lock is there; it just isn't tested.
- **The race between promotion and adding a member isn't tested.** The person-row lock covers it, and a family member left in a group sees nothing more than before (family members see every update).
- **No UI tests.** Post settings, the label, and the Groups section are checked by hand.
- **The preview seed doesn't create a group.** Slice 1's UI is checked locally; slice 2 creates groups through the page.
- **An audience-only edit marks the update "edited"**, because editing always records the edit time, the same as any save.
