# Implementation Plan: Leave-a-note button beside note-less updates, icon buttons, and bubble-shaped notes

Spec: [spec/updates.md → Reactions, Notes, Notes beside an update](spec/updates.md#notes-beside-an-update).

## Change

Front-end only, in `src/`; no server, schema, or API changes.

1. **`src/components/reactions.tsx`**: the React button shows Lucide's `HeartPlusIcon` until the viewer reacts, then their emoji as before. It keeps its "React" screen-reader label.
2. **`src/pages/Feed.tsx`**: the footer's "Leave a note" button shows `MessageSquareHeartIcon`, round, with "Leave a note" as its label. When `noteCount === 0`, an `<aside>` that is `hidden lg:block` holds `EmptyNoteButton`, which calls `setWriting(true)` to open the existing `NoteDialog`.
3. **`src/components/notes.tsx`**:
   - `EmptyNoteButton({ onLeave })`: a round icon button filled with `PALETTE.oak`, at the top of the space where notes would sit.
   - `Bubble`: the note card's shape. The card's bottom-left corner is square, and an inline SVG tail runs down from it, echoing the note icon. The outer `<article>` pads its bottom by the tail's height so the tail never overlaps the next card in the feed grid or the wall's columns.

The live feed swaps the button for the first note on its own, because both come from `update.notes`.

## Tests

None added. This is layout and glue with no visibility or permission rules, so per "Testing" it is checked in the browser pane instead:

- The React and Leave a note buttons show their icons and keep working.
- Note cards show the tail, aligned with the card's left border, on the feed and the wall.
- At a wide viewport, a note-less update shows the Oak button beside it, and it opens the note dialog. On a phone it doesn't appear.

Run `npm run typecheck` and `npm test` before pushing.

## Discoveries

- Tailwind v4's `space-y-*` puts its margin on every child except the last. With the tail as the card's last child, the signature row picked up an extra 12px below it. The tail now sits beside the card, inside the outer `<article>`, rather than inside it.

## Cut for speed

Nothing beyond the spec. The wall has no empty state.
