# Implementation plan: Allow notes

Spec: `spec/updates.md` → "Allowing notes" (plus Posting, Editing, the feed's footer, and "Notes beside an update"), and `spec/access.md` → "Notes on new updates".

Each update gets an "Allow notes" setting, chosen in Post settings. A family-wide default on the People page decides where that checkbox starts. When notes are off, the server refuses new notes on the update and the feed hides "Leave a note". Existing notes stay as they are.

## Steps

1. **Migration** (hand-written; see `claude/lessons.md` → "Commands that fail in an agent's shell"). Add `Update.allowNotes Boolean @default(true)` and `Family.allowNotesByDefault Boolean @default(true)`. Existing rows take the default, so every update posted before this allows notes. Check for drift with `prisma migrate diff` against a scratch database.

2. **Posting and editing** (`server/updates.ts`).
   - `allowNotesFrom(input)`: absent → `undefined`, a boolean → itself, anything else → 400 "Expected allowNotes to be true or false".
   - `createUpdate` and `createVideoUpdate`: when absent, use the family's `allowNotesByDefault`, read in the same call. Store it.
   - `editUpdate`: when present, set it in the existing locked update. When absent, leave it unchanged. Video updates are still refused before this point.
   - `UpdateView` gains `allowNotes`, which every viewer gets, since it decides whether "Leave a note" shows.

3. **Refusing notes** (`server/notes.ts` → `createNote`).
   - Read the update with `SELECT … FOR SHARE` in place of `findFirst`, still scoped by `familyId`.
   - If `allowNotes` is false, return 403 "Notes are turned off for this update".
   - Correct the comment in `deleteUpdate`: a note now waits at this `FOR SHARE` read and then finds the update gone (404), not at its insert. The P2003 catch stays as a backstop.
   - `FOR SHARE` makes a note wait for an edit that's turning notes off (the edit holds `FOR UPDATE`). It then sees the new value, instead of slipping in on a stale read. Shared locks don't block each other, so notes being left at the same time don't wait on each other.

4. **The family default** (`server/notes.ts`).
   - `setAllowNotesByDefault(db, person, input)`: `requireFamilyMember`, then a boolean or 400, then update the family and return `{ allowNotesByDefault }`.
   - New thin handler `api/f/[slug]/notes-default.ts` (PUT), shaped like `note-reactions.ts`.
   - `listPeople` returns `allowNotesByDefault`.
   - Every lookup and write here, and the default lookup in `createUpdate`, uses `person.familyId`, never the slug-loaded `ctx.family`.
   - `setAllowNotesByDefault` mirrors `setNoteReactions` (`server/reactions.ts`): one `family.update` with a `select`.
   - `newUpdateDefaults(db, person)` returns `{ allowNotesByDefault }` for a family member and `null` for anyone else. `GET /updates` adds it to its response as `defaults`. The feed re-reads it each time it loads, so a change on the People page reaches the post form when you go back to the feed, without a reload.

5. **Post settings** (`src/components/postSettings.tsx`).
   - New required props `allowNotes` and `onAllowNotes`. Both the post form and the text-update editor always pass them, and a video update has no editor.
   - An "Allow notes" checkbox, below the reactions setting.
   - A third icon on the button: lucide `MessageSquare`, or `MessageSquareOff` when notes are off. That's the same bubble as the footer's `MessageSquareHeart`. Screen readers hear "Allows notes" or "No notes".

6. **Feed** (`src/pages/Feed.tsx`).
   - The post form is mounted before the feed's first load, so it can't capture the default in `useState`. Instead it keeps `allowNotes: boolean | null`, where null means "not chosen". It shows and sends `allowNotes ?? defaults.allowNotesByDefault`, and posting sets it back to null. It sends the value with both text and video posts.
   - The editor passes the update's `allowNotes` and sends it on save.
   - `UpdateItem` hides only the two buttons when `!update.allowNotes`: the footer's "Leave a note" and the round Oak button beside the update. `NoteDialog` stays mounted, so a dialog that's already open survives the feed's check, and posting from it gets the server's refusal. Notes, their reactions, and Delete are unchanged.

7. **People page** (`src/pages/People.tsx`). A "Notes on new updates" section after "Reactions on notes", with the spec's text and one checkbox.
   - On change, it shows the new value at once and sends the PUT.
   - On success, it shows "Saved" beside the checkbox.
   - On failure, it reverts and shows the error beside the checkbox.

## Tests

Integration tests against Postgres. Each access test is proven to fail with its rule removed:

- `createNote` is refused (403) on an update with `allowNotes: false`, and still allowed on one with notes on. Prove it by removing the check.
- **The race:** a test transaction locks the update `FOR UPDATE` and sets `allowNotes = false`. `createNote` starts, `queuedOrDone(db, work, "transactionid")` waits until it's blocked, then the test commits. The note must be refused. Prove it by switching `FOR SHARE` back to a plain read, which lets the note through on its stale read.
- **Reactions and deletes still work:** reacting to and deleting an existing note on an update with notes off both succeed. This guards "existing notes stay".
- `setAllowNotesByDefault` is refused for a supporter (403), and a non-boolean gets a 400. Prove it by removing `requireFamilyMember`.
- `newUpdateDefaults` returns `null` for a supporter. Prove it by returning the value to everyone.
- **Defaults:** `createUpdate` with no `allowNotes` takes the family's default (set to false). An explicit `allowNotes` overrides it in both directions. A video update stores it too.
- `editUpdate` with `allowNotes: false` turns notes off and keeps the existing notes. Without `allowNotes`, the setting is left unchanged.

The UI is checked in the browser pane on the preview: the checkbox and icon, hiding "Leave a note", the People page save, and the default reaching the post form.

## Cut for speed

- Video updates can't change "Allow notes" after posting. This is already in `NEXT-SESSION.md` as "change a video update's post settings".
- No live update of an open note dialog when notes are turned off. Posting is refused with the message, and the feed's next check removes the button.
