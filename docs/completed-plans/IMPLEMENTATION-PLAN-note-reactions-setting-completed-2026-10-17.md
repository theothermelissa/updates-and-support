# Implementation plan: the family's note reactions

Spec: `spec/updates.md` ("Reactions," "Reacting to a note") and `spec/access.md` ("Reactions on notes"). One family-wide set of 0–6 catalog emoji, chosen by family members on the People page, is what every note offers. Today notes always offer `USUAL_REACTIONS`.

## Steps

1. **Schema.** Add `Family.noteReactionKinds String[] @default(["heart", "hug", "strong", "clap", "party", "laugh"])`, the same default as `Update.reactionKinds`. Hand-written migration `prisma/migrations/20261023000000_note_reactions/`; existing families get the usual six from the default. Confirm no drift with `prisma migrate diff`.

2. **Reading.** `noteView(note, viewerId, store, allowed)` takes the set instead of using `USUAL_REACTIONS`. A helper `noteReactionSet(db, familyId)` in `server/notes.ts` reads the family's column. Its three callers pass it:
   - `listUpdates` (feed) and `listNotes` (wall) read it once per request;
   - `createNote` reads it inside its transaction.
   The set is read by the person's own `familyId`, never from the address.

3. **Writing a note reaction.** In `setReaction`, after the existing `visibleNotes` lookup (so another family's note is still a 404, not a 400), a new note reaction must be in `noteReactionSet(db, person.familyId)`. That's the note's family, because `visibleNotes` requires the note's update to be in `person.familyId`. Clearing (`kind: null`) is always accepted. Same `notAllowed()` 400.

4. **Changing the set.** `setNoteReactions(db, person, { reactions })` in `server/reactions.ts`: `requireFamilyMember`, `parseReactionSet` (list, ≤6, catalog, distinct, catalog order), then update the person's own family. Returns `{ reactions }`. Thin handler `api/f/[slug]/note-reactions.ts`, `PUT` only, following `help-message.ts`. `listPeople` adds `noteReactions: family.noteReactionKinds` from the family it already loads.

5. **Picker.** Pull the "Use the usual reactions" checkbox, tray preview, and grid out of `PostSettings` into an exported `ReactionChooser({ reactions, onReactions, disabled })` in `src/components/postSettings.tsx`. `PostSettings` renders it in place; behavior there doesn't change.

6. **People page.** A "Reactions on notes" `Section` above "Community question" with the spec's explanation, a `Card` holding `ReactionChooser` and a **Save reactions** button. Local state starts from `people.noteReactions`; saving PUTs and shows "Note reactions saved." or the server's error in the page's existing message area, and sets local state from the response's `reactions`.

7. **Backlog.** Remove the "Let the family choose the note reactions on the People page" entry from `NEXT-SESSION.md`.

## Tests

Integration tests in `tests/integration/reactions.test.ts`, each proven to fail with its rule removed:

- **Each family's notes follow its own set.** Rivera sets `["pray", "skull"]` and Okafor sets `["sunflower"]`, both differing from the usual six and each other. For each family: `allowed` on a note from the feed, the wall, and `createNote`'s returned note is that family's set; a reaction in its set is accepted; one in the other family's set, and one from the usual six, are refused, storing nothing. Replaces "allows only the usual six on a note." Rules removed: checking against `USUAL_REACTIONS` again, and reading the set from a fixed or wrong family at any of the four sites.
- **An empty set refuses every note reaction, and clearing still works.** A reaction given before the set is emptied stays shown and counted, its owner can clear it, and no one can set it or any other.
- **Only a family member changes the set, and only their own family's.** `setNoteReactions` as a supporter is 403 and leaves the set; the endpoint refuses no session and another family's session (401), storing nothing; a valid family-member request is 200. After an Okafor family member saves, Rivera's set is unchanged. Rules removed: `requireFamilyMember`; writing by family.
- **This path validates the set.** One invalid set (seven emoji) is a 400 with the set unchanged, proving the path calls `parseReactionSet`, whose cases are already tested on updates; a valid set is stored in catalog order.

No UI tests; the People page and the shared picker are checked in the browser pane.

## Cuts and accepted risks

- A reaction arriving at the moment the set changes can land with an emoji that was just dropped. It only affects which emoji shows, not who sees anything; updates have the same race. No lock.
- Two family members saving at once: the later save wins, with no warning.
- The People page doesn't refresh the set while open; a save from another family member shows on reload.

## Discoveries

- `ReactionChooser` is controlled (`choosing` and `onChoosing` come from its owner). Post settings unmounts its contents when closed, so a chooser that kept its own `choosing` state would reopen checked after "Use the usual reactions" was unchecked with the usual six still selected.
- All nine rule removals tried (each of the four read sites, the helper's family filter, clear-always-allowed, `requireFamilyMember`, writing by family, validation) failed at least one test.
- In the browser pane, clicking several grid buttons in one synchronous script loses all but the last toggle, because each click sees the same pre-render state. Await between clicks.
