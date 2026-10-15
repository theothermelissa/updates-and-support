# Implementation Plan — Reactions on updates

Implements "Reactions" in `spec/updates.md`, with the matching lines in `spec/access.md` (supporters see each other's names on reactions; the Stated limits on reaction names). One session, one PR, two migrations: `reactions` adds an enum and a table, and `one_reaction_per_person` makes the table hold one reaction per person per update.

## Design

**Storage.** A `Reaction` row per person and update, unique on the pair, with a `kind` from a Postgres enum (`heart`, `pray`, `hug`, `strong`, `party`, `laugh`), so the database itself refuses any other value. The UI maps kinds to emoji; the only words for them are screen-reader names.

**Setting, not toggling.** The API takes `{ updateId, kind }`: a kind sets or replaces the person's reaction (an upsert), and `kind: null` clears it. The UI sends `null` when the viewer picks their current emoji. A retried request or a double tap lands in the same state.

**Loading with the feed.** `listUpdates` includes each update's reactions, filtered to people in the viewer's own family who aren't removed, in a fixed number of queries for the whole feed. The family filter is the read side's own rule: nothing in the database ties a reaction's person to the update's family, so the read path doesn't rely on the write path's check.

**What the viewer gets.** Each update's `reactions` is shaped for the viewer, with names and counts but never other people's IDs or emails:
- `count`
- `kinds`: the emoji used, most-used first, ties in the fixed order
- `mine`: the viewer's own kind, or null
- `named`: `{ name, kind }` for each named person other than the viewer, oldest first

Nameless readers are only counted. Names are read at load time, so a reader who later gives a name shows it on their earlier reaction.

**Who may react.** Anyone with a session for this family (`familyContext`), which already refuses removed people and other families' sessions. `setReaction` also re-checks that the person isn't removed, and that the update is in the person's own family; another family's update is a 404, as in `editUpdate`. The removed check is a plain read, so a removal can still land between it and the write; the load-time filter keeps such a reaction out of view.

**Removal hides; restore brings back.** Reactions of removed people are filtered out at load time, not deleted. Deleting an update cascades to its reactions.

**Nameless readers' reactions stay.** A reader who never gave a name isn't listed on the People page, so the family can't remove them, and changing the answer ends their sessions but keeps their records. Their reactions therefore stay counted. The spec's Stated limits says so; pruning those records is in `NEXT-SESSION.md`.

## Steps

1. **Migrations.**
   - `reactions`: `enum ReactionKind` and `model Reaction`, with cascading relations to `Update` and `Person`.
   - `one_reaction_per_person`: written by hand. It keeps each person's most recent reaction to an update (ties broken by ID), deletes the rest, and replaces the `(updateId, personId, kind)` unique index with `(updateId, personId)`. Only the preview database has ever held reactions.
2. **`server/reactions.ts`.**
   - `setReaction(db, person, input)` validates `updateId` and `kind` (one of the generated `ReactionKind` values, or `null`) with 400s, re-checks the person is active (403), and checks the update is in their family (404).
   - A kind upserts on `(updateId, personId)`, and `null` runs `deleteMany`. A unique-key race (`P2002`) retries the upsert once; a foreign-key error from an update deleted mid-request (`P2003`) is a 404.
   - `reactionsView(loaded, viewerId)` shapes the view.
3. **`server/updates.ts`**: `listUpdates` includes the filtered reactions and returns `FeedUpdate = UpdateView & ReactionsView`.
4. **`api/f/[slug]/reactions.ts`** (POST): `familyContext`, 401 without a session, `jsonBody`, `setReaction`.
5. **`src/reactions.ts`**: the six `{ kind, emoji, name }` entries (`name` is only for `aria-label`), `summary(r)` ("7 Reacted: ❤️🙏😂", up to three emoji), and `whoReacted(r)`, one line per person ("You ❤️" first, then "Ana Rivera 🙏", then "and N others", or "N people" when no one is named).
6. **`src/pages/Feed.tsx`**: a `Reactions` component under each update.
   - **React button and tray.** The button shows "React" or the viewer's emoji. The button and tray share one hover area: with a mouse (`pointerType === "mouse"`), entering opens the tray after 300ms and leaving closes it after 300ms. Clicking or tapping the button opens it at once.
   - **In the tray**, the six emoji are buttons with `aria-label` and `aria-pressed` for the viewer's current one. Picking one closes the tray and sends the new kind, or `null` for the current one. Escape (returning focus to the button) and a pointer-down outside close it. The button is disabled while a request is in flight.
   - **Summary.** A link-styled button showing `summary(r)`, hidden when nobody reacted. With a mouse, hovering shows `whoReacted(r)` in a small popover; clicking or tapping toggles the same list inline under the row (`aria-expanded`).
7. **`index.html`** styles: pill React button and tray buttons at least 44×44px, highlight for the viewer's emoji, absolutely positioned tray above the button and popover below the summary.
8. **`NEXT-SESSION.md`**: in "Prune anonymous supporter records with no live sessions," note that nameless readers' reactions stay counted until their records are pruned, and that pruning cascades to them.

## Tests

`tests/integration/reactions.test.ts`, against real Postgres, with the Rivera (Ana; supporter Sam) and Okafor (Chidi; supporter Olu) fixtures:

- **Own family only.** Olu reacting to a Rivera update gets 404 and stores nothing.
- **Removed people.**
  - A stale `Person` for a removed Sam gets 403, and his stored reaction is unchanged.
  - His earlier reaction disappears from Ana's view and returns when he's restored.
- **Invalid input.** A `kind` of `"thumbsup"`, `""`, or `42`, a missing `kind`, or a missing `updateId` gets 400 and stores nothing.
- **Visible only with the reader's own updates.** Olu's serialized feed contains no Rivera names.
- **Read-side family filter.** A cross-family row inserted directly (Olu on a Rivera update) doesn't appear in Ana's view.
- **Only names leave the server.** Ana's serialized feed contains Sam's name, but not his `id` or `email`.
- **The viewer's view.** With Ana on 🙏 and Sam and Tess on 😂, Sam sees `count: 3`, `kinds: [laugh, pray]`, `mine: laugh`, and Ana and Tess named.
- **Nameless readers.** A reader's reaction is counted with no name; once they give a name through `addEmail`, it appears.
- **One per person.**
  - The same kind twice leaves one row.
  - A different kind replaces it, still one row.
  - `null` twice clears it without error.
- **Deleting an update** removes its reactions.
- **The endpoint.**
  - A request with no session cookie gets 401, and so does Olu's Okafor token sent under Rivera's cookie name.
  - Sam's session gets 200.
  - This is the first test to call a handler directly. It points `DATABASE_URL` at the test database for the file and restores it afterwards.

`src/reactions.test.ts` covers `summary` (total and up to three emoji) and `whoReacted` ("You" first, named people, "and N others", "N people").

Hand check on the preview:
- check the tray on hover with a mouse, and with a tap on a phone-sized screen
- pick, replace, and remove a reaction
- check the summary text, the hover popover, the tapped inline list, and "You"
- check that a nameless reader is counted, not named, until they give a name
- check that Escape and an outside tap close the tray

## Cut for speed

- **No notifications or emails about reactions** (also the spec).
- **No custom or additional reactions**; changing the six needs a migration.
- **No live updates.** Others' reactions appear on reload, and a reaction reloads the whole feed rather than updating in place.
- **No avatars, facepile, or animations.**
- **No arrow-key navigation inside the tray**; Tab moves between its emoji.
- **No way to remove a nameless reader's reactions** (see Design).
- **No rate limit.** Each person has at most one row per update.
- **No pagination** of the feed or of names.

## Progress and discoveries

All steps are implemented, and `npm run typecheck` and `npm test` pass (139 tests).

**Proving the tests can fail.** Each rule was removed in turn from a copy of its file, and a test failed every time:
- the family scope on the update check: "treats another family's update as not found"
- the active-person check, and the `removedAt` filter on loading: "refuses a removed supporter…"
- the `kind` validation (the enum error surfaces instead of a 400): "rejects an unknown reaction…"
- replacing (an upsert changed to a plain create hits the unique key): "keeps one per person…"
- the `familyId` filter on loading: "filters reactions by family when reading…"
- the handler's 401: "refuses a request without this family's session…"

**Writing the second migration by hand.** `prisma migrate dev --create-only` refuses to run without an interactive terminal, so `one_reaction_per_person` was written by hand. Its dedupe query was checked on sample rows in a temporary table (it keeps the newest per person and update, breaking ties by ID), and `prisma migrate diff` shows no drift from the schema.

**A test helper's default hid a case.** Passing `undefined` as the kind to the test's `react()` helper picked up its default, `"heart"`, so the "missing kind" case stored a reaction instead of testing a 400. That case now calls `setReaction` directly.
