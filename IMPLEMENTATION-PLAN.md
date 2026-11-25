# Implementation plan: notes and reactions per group

Bridges `spec/updates.md` → "Who sees a note", "Leaving a note", "Reactions" (who is named), `spec/access.md` → "Groups and notes", and `spec/MASTER_SPEC.md` and the current code. One PR.

Today a reader who can see an update sees every note on it and every reactor's name. After this, a supporter sees notes from family members (unless for family members only), from supporters who share a group with them, from supporters in no group when they're in none themselves, and their own. A reactor is named only to a reader who sees that person's notes; everyone else is only counted. A family member can keep a note for family members only. A family with no groups sees no difference.

## Decisions already made (with Melissa)

- **One relation decides both notes and names.** Supporter S sees supporter T's notes, and sees T named on reactions, when they share a group or both are in no group. Family members are visible to everyone (unless a note is family-only) and see everyone.
- **A supporter's groups** are their memberships, counted only while their email is verified and they aren't removed (the rule `visibleUpdates` already uses for group updates). An unverified member, and anyone without an email, is in no group.
- **Live, not a snapshot.** Decided on every request from current membership.
- **Family notes have two audiences:** everyone who can see the update, or family members only. The server requires the choice from a family author (never defaults to the wider one), and refuses it from a supporter.
- **Counts include everyone.** Reaction totals and summaries count every reaction; only names are filtered.
- **Existing rows:** every existing note becomes `familyOnly = false`, so a family's current family notes keep reaching their audience.

## Cuts (for speed)

- A note's audience can't be changed after it's left.
- Supporters aren't told who sees their notes (groups are invisible to them, so there's nothing honest to say beyond what's on the page).
- No admin preview of "who sees what".
- Family notes can't be aimed at individual groups.
- The reader's peer set is loaded on every request that returns notes or reactions, from all of the family's people. Families are small; revisit if feed polling shows load.
- The "first group" prompt for existing posts is a separate feature (backlog).

## Schema

`prisma/schema.prisma`, `Note`:

```prisma
  // Only a family member's note can be for family members only; the server enforces it (a
  // supporter's is always false). A supporter never sees one.
  familyOnly Boolean   @default(false)
```

Hand-written migration `prisma/migrations/20261124020000_note_family_only/migration.sql`: `ALTER TABLE "Note" ADD COLUMN "familyOnly" BOOLEAN NOT NULL DEFAULT false;` (sorts after `20261124010000_family_admins`; check `origin/main` for a same-or-later timestamp before pushing). No data change. Follow `claude/lessons.md` → "Commands that fail in an agent's shell" for the migration and drift check.

## Server

### The rule, in one place: `readerScope`

New `server/readerScope.ts` (so `notes.ts` and `reactions.ts`, which import each other, both use it without a cycle):

```ts
export type ReaderScope = {
  isFamily: boolean;
  // Everyone whose notes this reader sees, and whom they see named on reactions: the reader
  // themself, the family's members, and the supporters who share a group with them (or, for a
  // reader in no group, who are also in none). One set, so the notes rule and the names rule
  // can't drift apart. Empty and unused for a family member, who sees everyone.
  seenIds: Set<string>;
};
export async function readerScope(db: Db, person: Person): Promise<ReaderScope>;
```

For a family member it returns `{ isFamily: true, seenIds: new Set() }` without querying. For a supporter, one `findMany` of the family's non-removed people selecting only `id`, `role`, `emailVerifiedAt`, and `groupMemberships: { select: { groupId, group: { select: { familyId } } } }` (memberships of groups in the person's family). In memory: each supporter's **effective groups** are their memberships when `emailVerifiedAt` is set, else none. `seenIds` is the reader, every family member, and the supporters who share an effective group with the reader or, when the reader has none, who also have none. Always read from the database, never from the session's `Person` (same as `visibleUpdates`).

### Notes

- `visibleNotes(person, scope)` replaces `visibleNotes(person)` and stays synchronous. For a family member it returns today's filter. For a supporter, `{ AND: [today's filter, { familyOnly: false }, { authorId: { in: [...scope.seenIds] } }] }` (the `AND` form, so a caller's own `OR` can't replace it). Family members' notes match because family members are in `seenIds`. Every caller awaits `readerScope` first: `listUpdates` (`server/updates.ts`), `listNotes`, `deleteNote`, and `setReaction`'s note branch (`server/reactions.ts`). Grep `visibleNotes(` for any other caller.
- `createNote`: input gains `audience`. A family member must send `"everyone"` or `"family"`, else 400 "Choose who sees this note." (checked before any lookup); a supporter who sends the field gets 400 "Only family members choose who sees a note." Stores `familyOnly: audience === "family"`. The note it returns goes through `noteView` with a scope of just the author (`{ isFamily: person.role === "family", seenIds: new Set([person.id]) }`): a new note has no reactions, so nothing is named, and no extra query runs.
- `NoteView` gains `familyOnly: boolean`, set only when the viewer is a family member (omitted for supporters).

### Reactions

`reactionsView(loaded, viewerId, allowed, scope)`: `count`, `kinds`, and `mine` use every reaction, as today. `named` includes a reactor only when `scope.isFamily || scope.seenIds.has(reactorId)`. `noteView` and the feed's update reactions both take the scope; every caller passes one explicitly, with no default. No client change is needed for the "and N others" line: it is `count` minus the lines shown (`src/reactions.ts`).

`setReaction` on an update is unchanged (the update's visibility is the only rule there); on a note it uses the scoped `visibleNotes`, so a note the reader can't see is a 404.

### Promotion keeps old notes private

`addFamilyMember`'s promotion path (`server/people.ts`, where it deletes the person's group memberships) also runs `tx.note.updateMany({ where: { authorId: existing.id }, data: { familyOnly: true } })` in the same transaction. Without it, a supporter's old notes, written for their group's eyes, would become family notes and reach every reader of the update. A restored removed supporter is unaffected (restoring a family member brings back their own settings).

### Call sites to touch

Grep `reactionsView(`, `noteView(`, `visibleNotes(`, `noteSelect(`, and every `FeedUpdate`/`NoteView` producer in `server/` and `api/`, including `createUpdate`/`editUpdate` if they return a feed update and any endpoint that returns a note. Each must pass a scope loaded for the person making the request.

### Seeds and fixtures

`scripts/seed-preview.ts` and `tests/integration/fixtures.ts`: no change needed unless a helper creates notes as a family member (it must now pass `audience`).

## Front end

- `src/api.ts`: `NoteView.familyOnly?: boolean`; the note-creation body gains `audience?: "everyone" | "family"`.
- `src/components/notes.tsx` (note dialog): for a family member, below the name and color, a labelled choice **"Who sees this note?"**: *Everyone who can see this update* (selected to begin with) and *Family members only*; sent as `audience`. Nothing for a supporter. Keep the dialog usable at 360px, and use the repo's existing radio component.
- Note card: for a family member's view of a `familyOnly` note, a small padlock and "Family only" beside the "Family" mark.
- `src/components/groups.tsx`: in the Groups section, where members are added, one line: "Groups also decide whose notes a supporter sees."
- Nothing else changes: the wall, the feed, and "See all N notes" count whatever the server sends.

## Tests

Integration tests in a new `tests/integration/noteScope.test.ts`. Existing tests that call `createNote` as a family member (14 call sites across `reactions`, `audience`, `admins`, `allowNotes`, `name`, `videos`, `notes`) pass `audience: "everyone"`; the supporter-authored calls must not pass it (a supporter sending it is now a 400).

**Audit the existing name assertions, and change the fixture, not the assertion, wherever a name now disappears unintentionally.** `tests/integration/audience.test.ts` around lines 327-345 (the group member who leaves a note, then asserts a reactor's name appears in her response) depends on the two sharing a group or both being in none. `tests/integration/reactions.test.ts` has `named` expectations at about lines 62, 113, 210, 224, 237, 313, 356, 383 and 472 where supporters name each other. Re-check each against the new rule.

Prove each access rule fails with the rule removed (copy the file to the scratchpad first; `claude/lessons.md` → "Patterns that hide a removed access rule"). Fixture: a family with groups A and B, family member F; supporters `a1`, `a2` (in A), `b1` (in B), `ab` (in A and B), `u1`, `u2` (in no group), `unv` (in A, email not verified), and one reading without an email; each leaves a note on an Everyone update.

1. **Who sees what, as a table.** For every reader, the exact set of authors whose notes appear in `listUpdates` and in the wall's `listNotes` (both, since they share the rule): F sees all; `a1` sees F, `a1`, `a2`, `ab`; `b1` sees F, `b1`, `ab`; `ab` sees F, `a1`, `a2`, `b1`, `ab`; `u1` sees F, `u1`, `u2`, `unv`, and the reader without an email; `unv` sees the same as `u1`. Mutation proofs: drop the peer filter; drop the "both in no group" branch; drop the verified-email condition from effective groups (then `unv` would see group A's notes and A would see theirs).
2. **No groups at all.** A family with none shows every supporter every note, as before. Mutation: treat "no group" as peerless.
3. **Family notes.** A family note for everyone reaches `a1`, `b1`, and `u1`; a family-only one reaches only F (as a family member sees it, with `familyOnly: true`) and never a supporter, including one who is the update's whole audience. Mutation: drop `familyOnly: false` from `visibleNotes`. Separately assert that a supporter's `NoteView` has no `familyOnly` key (`Object.keys`), though a supporter can't see a family-only note at all.
4. **`createNote` audience.** A family member's missing or invalid `audience` is 400 and creates nothing; `"everyone"` and `"family"` are stored; a supporter sending `audience` is 400. Mutation: remove each check.
5. **Live.** After `a1` is removed from A, `a2` no longer sees `a1`'s notes on the next load and `a1` is in no group; deleting group A moves `a1` and `a2` into the pool; verifying `unv` brings A's notes. Each is the next request, no new session.
6. **Hidden notes are 404s.** A supporter's `setReaction` and `deleteNote` on a family-only note, and `setReaction` on a note by a supporter in another group, are each "Note not found", the same as for a note that doesn't exist. `deleteNote`'s `authorId` check masks a missing scope for supporters, and nothing masks it for family members (their filter doesn't change), so the `setReaction` cases carry the proof; mutation: use the unscoped filter in `setReaction`'s note branch. Also assert that an author who moved to a different group can still delete their own note (`seenIds` includes the reader), and that a family member can delete any visible note.
7. **Reaction names.** On an update and on a visible note, with reactions from F, `a2`, `b1`, `u1` and the reader's own: reader `a1` sees `named` = F and `a2`, `count` includes everyone, and `b1`'s and `u1`'s names appear nowhere in the serialized response (assert on `JSON.stringify` of the whole feed, including no group names and no IDs of people not named). Reader `u2` is named `u1` and F, not `a2`. F sees all names. Mutations: drop the `seenIds` filter on `named`; make `seenIds` include everyone.
8. **Counts leak nothing.** `notes.length` per update, the wall, and the reaction `count`/`kinds` summary for a note never include a hidden note or a reaction on one. Mutation: load notes unscoped for the feed.
9. **Promotion.** A supporter with notes is promoted by `addFamilyMember`: their old notes are `familyOnly`, so a supporter who saw them before no longer does and a family member still does; a note they leave afterward with `audience: "everyone"` reaches everyone. Mutation: drop the `updateMany`.
10. **Migration.** The suite migrates once, so check the column by hand on a scratch database that has a note from before: its `familyOnly` is false. Record the result in the PR description.

## Order of work (subagents)

Environment: Node 24 at `/opt/node24/bin`; Postgres 16 on localhost:5432 (`pg_ctlcluster 16 main start`, role `dev`/`dev`); databases `uas_test` (tests), `uas_dev_a`, `uas_dev_b` (builders), `uas_verify` (verifier); a fresh session also needs `npm ci`, `npx prisma generate`, and a gitignored `.env` pointing at those. Give each subagent the Node path, database names, scratchpad path, and commit trailer.

1. **Builder A, in the main checkout:** schema, migration, `readerScope`, every Server change, the existing-test updates, `noteScope.test.ts`, and the mutation proofs. Commits its finished work; I push.
2. **Builder B, in a worktree, in parallel:** Front end, against the shapes above (`audience` on the create body, `familyOnly` on `NoteView`).
3. **Verifier C, after both:** independent. Greps every `visibleNotes`, `noteView`, `reactionsView` call and checks each passes a scope for the requester; reads every endpoint that returns notes or reactions for a leak; re-runs three mutation proofs; one browser pass (360px and 1280px) of a supporter in group A, one in no group, and a family member: the notes each sees, the family-only choice and padlock, and the reaction lists.
4. I check the claims that matter, run `npm run typecheck` and `npm test`, open the PR, and give Melissa preview steps: as a family member, leave one note for everyone and one for family members only; sign in as two supporters in different groups (and one in none) and confirm who sees which notes and names.
