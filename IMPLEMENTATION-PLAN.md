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
  // Supporters whose notes this reader sees, and whom they see named: the reader themself,
  // supporters sharing a group, or both in no group. Empty for a family member (unused).
  peerIds: Set<string>;
  // Everyone this reader may see named on a reaction: peerIds plus the family's members.
  // Unused for a family member, who sees every name.
  namedIds: Set<string>;
};
export async function readerScope(db: Db, person: Person): Promise<ReaderScope>;
```

For a family member it returns `{ isFamily: true, … empty }` without querying. For a supporter, one query of the family's non-removed people with `role`, `emailVerifiedAt`, and `groupMemberships: { select: { groupId, group: { select: { familyId } } } }` (filtered to the person's family). In memory: each supporter's **effective groups** are their memberships when `emailVerifiedAt` is set, else none; the reader's peers are the supporters who share an effective group with them, or, when the reader has no effective groups, the supporters who also have none; plus the reader. Always read from the database, never from the session's `Person` (same as `visibleUpdates`).

### Notes

- `visibleNotes(person, scope)` replaces `visibleNotes(person)` and stays synchronous. For a family member it returns today's filter. For a supporter, `{ AND: [today's filter, { familyOnly: false }, { OR: [{ author: { role: "family" } }, { authorId: { in: [...scope.peerIds] } }] }] }` (the `AND` form, so a caller's own `OR` can't replace it). Every caller awaits `readerScope` first: `listUpdates` (`server/updates.ts`), `listNotes`, `deleteNote`, and `setReaction`'s note branch (`server/reactions.ts`). Grep `visibleNotes(` for any other caller.
- `createNote`: input gains `audience`. A family member must send `"everyone"` or `"family"`, else 400 "Choose who sees this note." (checked before any lookup); a supporter who sends the field gets 400 "Only family members choose who sees a note." Stores `familyOnly: audience === "family"`. The note it returns goes through `noteView` for the author, who always sees it.
- `NoteView` gains `familyOnly: boolean`, set only when the viewer is a family member (omitted for supporters).

### Reactions

`reactionsView(loaded, viewerId, allowed, scope)`: `count`, `kinds`, and `mine` use every reaction, as today. `named` includes a reactor only when `scope.isFamily || scope.namedIds.has(reactorId)`. `noteView` and the feed's update reactions both take the scope. No client change is needed for the "and N others" line: it is `count` minus the lines shown (`src/reactions.ts`).

`setReaction` on an update is unchanged (the update's visibility is the only rule there); on a note it uses the scoped `visibleNotes`, so a note the reader can't see is a 404.

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

Integration tests in a new `tests/integration/noteScope.test.ts`. Existing tests that call `createNote` as a family member (14 call sites across `reactions`, `audience`, `admins`, `allowNotes`, `name`, `videos`, `notes`) pass `audience: "everyone"`.

Prove each access rule fails with the rule removed (copy the file to the scratchpad first; `claude/lessons.md` → "Patterns that hide a removed access rule"). Fixture: a family with groups A and B, family member F; supporters `a1`, `a2` (in A), `b1` (in B), `ab` (in A and B), `u1`, `u2` (in no group), `unv` (in A, email not verified), and one reading without an email; each leaves a note on an Everyone update.

1. **Who sees what, as a table.** For every reader, the exact set of authors whose notes appear in `listUpdates` and in the wall's `listNotes` (both, since they share the rule): F sees all; `a1` sees F, `a1`, `a2`, `ab`; `b1` sees F, `b1`, `ab`; `ab` sees F, `a1`, `a2`, `b1`, `ab`; `u1` sees F, `u1`, `u2`, `unv`, and the reader without an email; `unv` sees the same as `u1`. Mutation proofs: drop the peer filter; drop the "both in no group" branch; drop the verified-email condition from effective groups (then `unv` would see group A's notes and A would see theirs).
2. **No groups at all.** A family with none shows every supporter every note, as before. Mutation: treat "no group" as peerless.
3. **Family notes.** A family note for everyone reaches `a1`, `b1`, and `u1`; a family-only one reaches only F (as a family member sees it, with `familyOnly: true`) and never a supporter, including one who is the update's whole audience. Mutation: drop `familyOnly: false` from `visibleNotes`; separately, send `familyOnly` to supporters in `noteView` and assert they never get the key.
4. **`createNote` audience.** A family member's missing or invalid `audience` is 400 and creates nothing; `"everyone"` and `"family"` are stored; a supporter sending `audience` is 400. Mutation: remove each check.
5. **Live.** After `a1` is removed from A, `a2` no longer sees `a1`'s notes on the next load and `a1` is in no group; deleting group A moves `a1` and `a2` into the pool; verifying `unv` brings A's notes. Each is the next request, no new session.
6. **Hidden notes are 404s.** `setReaction` on a note the reader can't see is "Note not found", the same as for a note that doesn't exist; `deleteNote` by a supporter on another group's note is also 404. Mutation: use the unscoped filter in `setReaction`'s note branch (`deleteNote`'s `authorId` check would mask a missing scope there, so assert the reaction path, and assert directly that a family member can delete a note and a supporter can delete only their own).
7. **Reaction names.** On an update and on a visible note, with reactions from F, `a2`, `b1`, `u1` and the reader's own: reader `a1` sees `named` = F and `a2`, `count` includes everyone, and `b1`'s and `u1`'s names appear nowhere in the serialized response (assert on `JSON.stringify` of the whole feed, including no group names and no IDs of people not named). Reader `u2` is named `u1` and F, not `a2`. F sees all names. Mutations: drop the `namedIds` filter; make `namedIds` include everyone.
8. **Counts leak nothing.** `notes.length` per update, the wall, and the reaction `count`/`kinds` summary for a note never include a hidden note or a reaction on one. Mutation: load notes unscoped for the feed.
9. **Removed supporters** still vanish (existing behavior), and a restored one's notes return. No new test unless one breaks.
10. **Migration.** The suite migrates once, so check the column by hand on a scratch database that has a note from before: its `familyOnly` is false. Record the result in the PR description.

## Order of work (subagents)

Environment: Node 24 at `/opt/node24/bin`; Postgres 16 on localhost:5432 (`pg_ctlcluster 16 main start`, role `dev`/`dev`); databases `uas_test` (tests), `uas_dev_a`, `uas_dev_b` (builders), `uas_verify` (verifier); a fresh session also needs `npm ci`, `npx prisma generate`, and a gitignored `.env` pointing at those. Give each subagent the Node path, database names, scratchpad path, and commit trailer.

1. **Builder A, in the main checkout:** schema, migration, `readerScope`, every Server change, the existing-test updates, `noteScope.test.ts`, and the mutation proofs. Commits its finished work; I push.
2. **Builder B, in a worktree, in parallel:** Front end, against the shapes above (`audience` on the create body, `familyOnly` on `NoteView`).
3. **Verifier C, after both:** independent. Greps every `visibleNotes`, `noteView`, `reactionsView` call and checks each passes a scope for the requester; reads every endpoint that returns notes or reactions for a leak; re-runs three mutation proofs; one browser pass (360px and 1280px) of a supporter in group A, one in no group, and a family member: the notes each sees, the family-only choice and padlock, and the reaction lists.
4. I check the claims that matter, run `npm run typecheck` and `npm test`, open the PR, and give Melissa preview steps: as a family member, leave one note for everyone and one for family members only; sign in as two supporters in different groups (and one in none) and confirm who sees which notes and names.
