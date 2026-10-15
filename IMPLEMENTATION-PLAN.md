# Implementation Plan — Reactions on updates

Implements "Reactions" in `spec/updates.md`, with the matching lines in `spec/access.md` (supporters see each other's names on reactions; the Stated limits on reaction names). One session, one PR, one additive migration (`reactions`: a new enum and table).

## Design

**Storage.** A `Reaction` row per person, update, and reaction, unique on all three. The six reactions are a Postgres enum (`heart`, `pray`, `hug`, `strong`, `party`, `laugh`), so the database itself refuses any other value; the UI maps them to emoji and labels.

**Setting, not toggling.** The API takes `{ updateId, kind, on }` and sets that reaction on or off. The UI sends `on: !mine`. A retried request or a double tap then lands in the same state instead of flipping back.

**Loading with the feed.** `listUpdates` includes each update's reactions, filtered to people in the viewer's own family who aren't removed, in a fixed number of queries for the whole feed. The family filter is the read side's own rule: nothing in the database ties a reaction's person to the update's family, so the read path doesn't rely on the write path's check.

**What the viewer gets.** The server shapes each update's reactions for the viewer, sending names and counts but never other people's IDs or emails:
- `reactions`: for each reaction someone gave, in the fixed order, its `kind`, `count`, the `names` of named people other than the viewer (oldest first), and whether it's `mine`
- `reactors`: the number of distinct people who reacted, the names of the named ones other than the viewer (in the order they first reacted), and whether the viewer is one (`you`)

Nameless readers are counted but never named. The UI's `whoReacted(names, you, total, limit)` writes the text: "You" first, then names, then everyone else as "and N others" ("1 person" / "N people" when no one is named). Names are read at load time, so a reader who later gives a name shows it on their earlier reactions.

**Who may react.** Anyone with a session for this family (`familyContext`), which already refuses removed people and other families' sessions. `setReaction` also re-checks that the person isn't removed, and that the update is in the person's own family; another family's update is a 404, as in `editUpdate`. The removed check is a plain read, so a removal can still land between it and the insert; the load-time filter is what keeps such a reaction out of view.

**Removal hides; restore brings back.** Reactions of removed people are filtered out at load time, not deleted. Deleting an update cascades to its reactions.

**Nameless readers' reactions stay.** A reader who never gave a name isn't listed on the People page, so the family can't remove them, and changing the answer ends their sessions but keeps their records. Their reactions therefore stay counted. The spec's Stated limits says so; pruning those records is in `NEXT-SESSION.md`.

## Steps

1. **Schema and migration**: `enum ReactionKind`, `model Reaction` with cascading relations to `Update` and `Person`, `@@unique([updateId, personId, kind])`.
2. **`server/reactions.ts`**: `setReaction(db, person, input)` validates `updateId`, `kind` (against the generated `ReactionKind` values), and `on` (400s), re-checks the person is active (403) and the update is in their family (404). On is `createMany` with `skipDuplicates`; off is `deleteMany`; a foreign-key error from an update deleted mid-request is a 404. `reactionsView(loaded, viewerId)` shapes `reactions` and `reactors`.
3. **`server/updates.ts`**: `listUpdates` includes the filtered reactions and returns `FeedUpdate = UpdateView & ReactionsView`. `createUpdate` and `editUpdate` keep returning `UpdateView`, since the feed reloads after every change.
4. **`api/f/[slug]/reactions.ts`** (POST): `familyContext`, 401 without a session, `jsonBody`, `setReaction`.
5. **`src/reactions.ts`**: the six `{ kind, emoji, label }` entries and `whoReacted`.
6. **`src/pages/Feed.tsx`**: a `Reactions` component under each update.
   - Six buttons with emoji and count, `aria-pressed` for the viewer's own, `aria-label` with label and count, and `title` listing who gave it. All are disabled while a request is in flight.
   - The summary line (up to two names) is a link-styled button with `aria-expanded` that toggles a list of each given reaction with everyone who gave it.
7. **`index.html`** styles: wrapping row of pill buttons at least 44×44px, highlighted when pressed.
8. **`NEXT-SESSION.md`**: in "Prune anonymous supporter records with no live sessions," note that nameless readers' reactions stay counted until their records are pruned, and that pruning cascades to them.

## Tests

`tests/integration/reactions.test.ts`, against real Postgres, with the Rivera (Ana; supporter Sam) and Okafor (Chidi; supporter Olu) fixtures:

- **Own family only.** Olu reacting to a Rivera update gets 404 and stores nothing.
- **Removed people.** A stale `Person` for a removed Sam gets 403 and stores nothing. His earlier reaction disappears from Ana's feed, both counts and names, and returns when he's restored.
- **Invalid input.** `kind` of `"thumbsup"`, `""`, or `42`, `on` of `"yes"`, or no `updateId` gets 400 and stores nothing.
- **Visible only with the reader's own updates.** Olu's serialized feed contains no Rivera names.
- **Read-side family filter.** A cross-family row inserted directly (Olu on a Rivera update) doesn't appear in Ana's feed.
- **Only names leave the server.** Ana's serialized feed contains Sam's name, but not his `id` or `email`.
- **The viewer is "mine"/"you", not named.** Sam sees Ana named and himself as `mine`/`you`, and the reverse for Ana.
- **Nameless readers.** A reader's reaction is counted with no name; once they give a name through `addEmail`, it appears.
- **Idempotent.** On twice leaves one row; three reactions from Sam count him once; off twice leaves none.
- **Deleting an update** removes its reactions.
- **The endpoint.** A request with no session cookie gets 401, and so does Olu's Okafor token sent under Rivera's cookie name; Sam's session gets 200. This is the first test to call a handler directly: it points `DATABASE_URL` at the test database for the file and restores it afterwards.

`src/reactions.test.ts` covers `whoReacted`'s wording: up to two names, "You" first, nameless readers counted, and the unlimited list.

Hand check on the preview:
- react and un-react as a family member and as a reader in a private window
- check the highlight, counts, summary line with "You", the expanded list, and button titles on a computer
- check that the nameless reader is counted, not named, until they give a name
- check tap targets at phone width

## Cut for speed

- **No notifications or emails about reactions** (also the spec).
- **No custom or additional reactions**; changing the six needs a migration.
- **No live updates.** Others' reactions appear on reload; a reaction reloads the whole feed rather than updating in place.
- **No facepile, avatars, or animations.**
- **No way to remove a nameless reader's reactions** (see Design).
- **No rate limit.** Each person can store at most six rows per update.
- **No pagination** of the feed or of names.

## Progress and discoveries

All steps are implemented, and `npm run typecheck` and `npm test` pass (139 tests).

**Proving the tests can fail.** Each rule was removed in turn from a copy of its file, and a test failed every time:
- the family scope on the update check: "treats another family's update as not found"
- the active-person check, and the `removedAt` filter on loading: "refuses a removed supporter…"
- the `kind` validation (the enum error surfaces instead of a 400): "rejects an unknown reaction…"
- `skipDuplicates` (the second "on" hits the unique key): "is idempotent…"
- the `familyId` filter on loading: "filters reactions by family when reading…"
- the handler's 401: "refuses a request without this family's session…"

**Not checked in a browser locally.** `vercel dev` needs a Vercel login this machine doesn't have, so the UI is for the preview.
