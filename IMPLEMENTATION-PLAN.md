# Implementation Plan — Reactions on updates

Implements "Reactions" in `spec/updates.md`, with the matching lines in `spec/access.md` (supporters see each other's names on reactions; the Stated limit on reaction names). One session, one PR, one additive migration.

## Design

**Storage.** A `Reaction` row per person, update, and reaction, unique on all three. The six reactions are a Postgres enum, so the database itself refuses any other value. The keys are `heart`, `pray`, `hug`, `strong`, `party`, `laugh`; the UI maps them to emoji and labels.

**Setting, not toggling.** The API takes `{ updateId, kind, on }` and sets that reaction on or off. The UI sends `on: !mine`. A retried request or a double tap then lands in the same state instead of flipping back, so "on" twice and "off" twice are both harmless.

**Loading with the feed.** `listUpdates` includes each update's reactions, filtered to people in the viewer's own family who aren't removed, with each reactor's ID and name. Prisma loads them in a fixed number of queries for the whole feed, not one per update. The family filter is the read side's own rule: nothing in the database ties a reaction's person to the update's family, so the read path doesn't rely on the write path's check. The server shapes each update's reactions for the viewer, so the client never gets other people's IDs:

- `reactions`: for each reaction someone gave, in the fixed order, its `kind`, the `names` who gave it (oldest first), and whether it's `mine`
- `reactedBy`: one display name per person who reacted, in the order they first reacted, for the summary line

A person without a name shows as "Someone". Names are read at load time, so a reader who later gives a name shows it on their earlier reactions.

**Who may react.** Anyone with a session for this family (`familyContext`), which already refuses removed people and other families' sessions. `setReaction` also re-checks that the person isn't removed, and that the update is in the person's own family. The removed check is a plain read, so a removal can still land between it and the insert; the load-time filter is what keeps such a reaction out of view. Another family's update behaves like one that doesn't exist (404), as in `editUpdate`.

**Removal hides; restore brings back.** Reactions of removed people are filtered out at load time rather than deleted, which also covers a reaction that lands in the instant after removal. Deleting an update cascades to its reactions.

**Nameless readers' reactions stay.** A reader who never gave a name isn't listed on the People page, so the family can't remove them, and changing the answer ends their sessions but keeps their records. Their "Someone" reactions therefore stay visible. The spec's Stated limits says so; pruning those records is in `NEXT-SESSION.md`.

**Migration and deploys.** The migration only adds an enum and a table, so the code already in production keeps working after `vercel-build` migrates before the new code is live. This PR's preview applies the migration to the shared `preview` database. If the PR is abandoned, or another open PR changes the schema before this merges, the preview database must be recreated (README → Deployment). Right now the only other open PR (#12) changes no schema. It does edit `MASTER_SPEC.md`'s Later list, so a small merge conflict there is possible.

## Steps

1. **Schema and migration** (`prisma/schema.prisma`, `npm run db:migrate` named `reactions`):
   - `enum ReactionKind { heart pray hug strong party laugh }`
   - `model Reaction { id, updateId, personId, kind, createdAt }`, with relations to `Update` and `Person` (both `onDelete: Cascade`), `@@unique([updateId, personId, kind])`, and the back-relations `reactions Reaction[]` on `Update` and `Person`.
2. **`server/reactions.ts`**: `setReaction(db, person, input)`.
   - `kind` must be one of the generated `ReactionKind` enum's values (400 "Unknown reaction"), so there's no second list to keep in step; `on` must be a boolean (400); `updateId` must be a string (400).
   - The person must still be active: `findFirst({ id: person.id, removedAt: null })`, else 403.
   - The update must be in the person's family: `findFirst({ id: updateId, familyId: person.familyId })`, else 404 "Update not found".
   - On: `createMany({ data, skipDuplicates: true })`. Off: `deleteMany({ updateId, personId, kind })`.
   - An update deleted between the check and the insert raises a foreign-key error (`P2003`); treat it as 404.
3. **`server/updates.ts`**: `listUpdates` includes `reactions: { where: { person: { familyId: person.familyId, removedAt: null } }, orderBy: { createdAt: "asc" }, select: { kind, personId, person: { select: { name } } } }`, and a `reactionsView(reactions, viewerId)` helper shapes `reactions` and `reactedBy`. Only `listUpdates`'s items gain the two fields (`FeedUpdate = UpdateView & { … }`); `createUpdate` and `editUpdate` keep returning `UpdateView`, since the feed reloads after every change.
4. **`api/f/[slug]/reactions.ts`** (POST): `familyContext`, 401 without a session, `jsonBody`, `setReaction`, then `{ ok: true }`. A family-level path, like `supporters.ts`, avoids nesting a route under `updates/[id].ts`.
5. **`src/reactions.ts`**: the six `{ kind, emoji, label }` entries, and `summary(names)`:
   - one name: "Ana Rivera"
   - two names: "Ana Rivera and Sam Friend"
   - three names: "Ana Rivera, Sam Friend and 1 other"
   - more: "Ana Rivera, Sam Friend and N others"
6. **`src/pages/Feed.tsx`**: under each update, a `Reactions` component.
   - Six buttons, each showing its emoji and, when above zero, its count. Each has `aria-pressed` for the viewer's own reactions, `aria-label` with the label and count, and `title` listing the names (or the label when none). Each button is disabled while its request is in flight. Pressing one calls `change("reactions", "POST", { updateId, kind, on: !mine })`, which reloads the feed.
   - When `reactedBy` isn't empty, the summary line is a link-styled button with `aria-expanded` that toggles an inline list with one line per given reaction: emoji, label, and names.
7. **`index.html`** styles: `.reaction` buttons at least 44×44px with a larger emoji, a highlighted background and border for `[aria-pressed="true"]`, and buttons that wrap on narrow screens. Restart `npm start` after adding the new `api/` file (see `claude/lessons.md`).
8. **`NEXT-SESSION.md`**: in "Prune anonymous supporter records with no live sessions," note that nameless readers' "Someone" reactions stay visible until their records are pruned, and that pruning cascades to those reactions.

## Tests

New `tests/integration/reactions.test.ts`, against real Postgres, with the Rivera (Ana; supporter Sam) and Okafor (Chidi; supporter Olu) fixtures:

- **Own family only.** Olu reacting to a Rivera update gets 404 and stores nothing.
- **Visible only with the updates the reader can see.**
  - After Sam and Ana react to a Rivera update, Olu's `listUpdates` contains no Rivera names (checked on the serialized feed).
  - A cross-family row inserted directly with `db.reaction.create` (Olu on a Rivera update) doesn't appear in Ana's feed. This guards the read side's own family filter, which writes through `setReaction` could never exercise.
- **Only names leave the server.** Ana's serialized feed contains Sam's name but not his `id` or `email`.
- **Removed people.**
  - A stale `Person` for a removed supporter gets 403 and stores nothing.
  - A reaction Sam gave before removal disappears from Ana's feed, both its count and the summary, and returns when Sam is restored.
- **Invalid input.** `kind` of `"thumbsup"`, `""`, or `42`, or `on` of `"yes"`, gets 400 and stores nothing.
- **Setting is idempotent.**
  - On twice leaves one row, with count 1, `mine: true` for Sam and `mine: false` for Ana.
  - Off twice leaves none, without error.
  - Sam giving three different reactions appears once in `reactedBy`.
- **Names.**
  - A reader without a name shows as "Someone".
  - After that reader gives a name through `addEmail`, their earlier reaction shows it.
  - A family member's reaction shows their name.
- **Deleting an update** removes its reactions.
- **Unauthenticated (handler level).** The first test that calls a handler directly, with a minimal request and response stub. It sets `DATABASE_URL` to the test database before the handler first runs (`getDb` reads it lazily and caches its client), and disconnects `getDb()` in `afterAll`:
  - a POST to `/api/f/<rivera>/reactions` without a session cookie gets 401 and stores nothing
  - Olu's Okafor session token sent under **Rivera's** cookie name (`session_<rivera slug>`) also gets 401; under Okafor's name, the handler would never read it, and the test would only repeat the no-cookie case

Unit test `src/reactions.test.ts` covers `summary` for one, two, three, and many names.

**Prove each access test can fail.** Remove these in turn, and confirm a test fails each time:
- the family scope on the update check
- the active-person check (asserting on the database, not the feed)
- the `familyId` and `removedAt` filters on loading
- the `kind` validation (without it, the enum error surfaces as a 500, not a 400)
- `skipDuplicates`
- the handler's 401

**Hand check on the preview:**
- as a family member and a reader in two browsers, react and un-react, and see the highlight
- check the counts, the summary line, the expanded list, and "Someone" for the reader
- after the reader gives a name, the name replaces "Someone"
- the buttons are easy to tap at phone width

## Cut for speed

- **No notifications or emails about reactions** (also the spec).
- **No custom or additional reactions**; changing the six needs a migration.
- **No live updates.** Others' reactions appear on reload; a reaction reloads the whole feed rather than updating in place.
- **No "You" in the summary line.** The viewer's own name appears like anyone else's.
- **Several nameless readers show as "Someone, Someone"** rather than "2 people".
- **No way to remove a nameless reader's reactions** (see Design).
- **No per-update facepile, avatars, or reaction animations.**
- **No rate limit.** Each person can store at most six rows per update.
- **No pagination** of the feed or of names; the expanded list shows everyone.
