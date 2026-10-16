# Implementation Plan: Empty note card beside note-less updates

Spec: [spec/updates.md → Notes beside an update](spec/updates.md#notes-beside-an-update).

## Change

One front-end change in `src/`; no server, schema, or API changes.

1. **`src/components/notes.tsx`**: add `EmptyNoteCard({ onLeave })`, a note-sized card with the same rounding and padding as a written `NoteCard`. It uses `PALETTE.oak.fill` for the background, a dashed border in `PALETTE.oak.text` at low opacity, and a centered "Leave a note" outline button, with a minimum height so it reads as a card rather than a strip.
2. **`src/pages/Feed.tsx`**: in `UpdateCard`, when `noteCount === 0`, render the empty card inside an `<aside>` that is `hidden lg:block`, so phones and tablets don't show it. Its button calls `setWriting(true)`, which opens the existing `NoteDialog`.

The live feed swaps the empty card for the first note on its own, because both come from `update.notes`.

## Tests

None added. This is layout and glue with no visibility or permission rules, so per "Testing" it is checked in the browser pane instead:

- At a wide viewport, a note-less update shows the Oak card beside it, and its button opens the note dialog.
- After leaving a note, the card is replaced by the note.
- At 375px, the card doesn't appear and the page doesn't scroll sideways.

Run `npm run typecheck` and `npm test` before pushing.

## Cut for speed

Nothing beyond the spec. The wall is unchanged and has no empty state.
