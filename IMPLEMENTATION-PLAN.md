# Implementation Plan — Reactions on notes

Implements `spec/updates.md` → "Reactions" and "Reacting to a note," with the matching lines in `spec/MASTER_SPEC.md` and `spec/access.md` (who sees reaction names).

One session, one PR. The six reactions are ❤️ 🤗 💪 👏 🎉 😂, on updates and on notes. Existing 🙏 reactions are deleted.

## Design

**One set, two tables.** `ReactionKind` becomes `heart`, `hug`, `strong`, `clap`, `party`, `laugh`, in that order, which is the tray order and the tie-break when two emoji are used equally. Updates keep the `Reaction` table. Notes get a `NoteReaction` table of the same shape (`noteId`, `personId`, `kind`, unique on the pair), cascading when the note or the person is deleted. Deleting an update already deletes its notes, so their reactions go too.

**Postgres can't drop an enum value.** The migration deletes every `pray` row, then replaces the type. During the deploy minute the previous server can fail a 🙏 reaction; that reaction is no longer offered.

**The same rules as update reactions.** `setReaction` takes exactly one of `updateId` or `noteId`, plus `kind` (or `null` to clear). Both or neither is a 400 and stores nothing. A removed person is a 403, from the same plain read as updates; a removal that lands after the read is hidden when the note is loaded. Another family's note, a missing note, and a note whose author is removed are a 404: the write uses the same conditions as `visibleNotes` (the note's update and author are in this family, and the author is not removed). `reactions.ts` repeats those conditions rather than importing `notes.ts`, because `notes.ts` imports the shared view from `reactions.ts`.

**Reading doesn't trust the write.** The feed and the wall load each note's reactions with the same person filter updates already use: this family, and not removed. `reactionsView` shapes both, so a response has names and counts, never another person's id or email. A nameless reader's reaction is only counted until they give a name.

**On a note, the tray stays inside the card.** The wall's columns clip anything that sticks out. The control sits on the row with the time: "React" until the viewer has reacted, then their emoji, with the summary beside it. Choosing it opens the six emoji in the card, wrapping when the card is narrow. Tapping the summary shows who reacted, in the card. Click, tap, and the keyboard open them; resting the pointer does not, so moving across the wall doesn't keep resizing cards. Escape or a tap elsewhere closes the emoji. Updates keep the floating tray and the hover.

No emails, no notifications, no rate limit, same as update reactions. A reaction reloads the feed or the wall.

## Steps

1. **Migration `note_reactions`**, written by hand. Delete `pray` rows, replace `ReactionKind`, create `NoteReaction`. `prisma migrate diff` shows no drift.
2. **`server/reactions.ts`.** The shared person filter, `setReaction` for a note or an update, and `reactionsView` unchanged in shape.
3. **`server/notes.ts`.** `noteSelect(familyId)` includes the filtered reactions. `noteView` adds them. The feed and the wall both use it.
4. **`src/reactions.ts`.** The six emoji, with 👏 ("Clapping hands") where 🙏 was, after 💪.
5. **`src/components/reactions.tsx`.** The update control, moved from the feed, plus the in-card control. The feed and `NoteCard` both use it, on the feed and on the wall.
6. **Tests.** Update reactions that used 🙏 now use another emoji, and `pray` is an unknown kind. Note reactions get the same access cases as update reactions.

## Tests

`tests/integration/reactions.test.ts`, against real Postgres, Rivera (Ana; supporter Sam) and Okafor (Chidi; supporter Olu):

- Another family's note is a 404 and stores nothing. A note whose author is removed is a 404. A removed Sam is a 403, his stored reaction is unchanged, it disappears from Ana's view, and it returns when he's restored.
- An unknown kind (including `pray`), a missing id, and both an update and a note store nothing.
- A reaction inserted for Olu on a Rivera note is hidden from Ana on the wall and on the feed. The two views otherwise agree.
- Names are sent, never ids or emails. The viewer's own reaction is `mine`; others are named, most-used emoji first. A nameless reader's reaction is counted, and named once they give a name through `addEmail`.
- One reaction per person per note: setting it again, replacing it, and clearing it are each idempotent.
- Deleting the note, or the update, removes the reactions.
- The endpoint is 401 without this family's session, for a note as for an update.

Each new access check is shown failing with the check removed: the note's family on write, the removed-author check, the person filter on read, and the session check on the endpoint.

`src/reactions.test.ts` covers the summary with 👏.

UI layout is checked on the preview: react, replace, and remove on an update and on a note, on the feed and on the wall, on a phone width and on a wide screen.

## Progress

Typecheck passes, and all 251 tests pass. The migration applied to the test database, and a fresh database with every migration applied matches the schema. Each new access check was removed in turn and its test failed: the note's family on write, the removed-author check, the person filter on read, and the session check on the endpoint.

The shared write is a small function both tables call. A single Prisma delegate type wouldn't accept both tables.

## Cut for speed

- **No emails or live updates** when someone reacts (also the spec).
- **No hover-to-open on a note.** The list and the emoji sit in the card.
- **No separate rate limit.** One reaction per person per note already bounds it.
