# Implementation plan: per-update reactions

Brings the code in line with `spec/updates.md` → "Reactions," "Posting," and "Editing": a fixed catalog of emoji bundled with the app, a set of 0–6 reactions on each update chosen in a collapsible Post settings section, and the server refusing reactions outside the update's set. Notes keep the usual six.

## Shape

- **The catalog** is one shared module, `src/lib/reactionCatalog.ts`, imported by both `server/` and `src/` (as `src/lib/doc.ts` already is). Each entry is `{ kind, emoji, name }`, and the entries are grouped in the spec's order. `kind` is a stable ASCII key (`heart`, `skull`, `middle_finger`); the six existing keys stay as they are, so stored reactions need no rewriting. Catalog order is the tray order and breaks ties in the summary.
- **Storage.** `Reaction.kind` and `NoteReaction.kind` change from the `ReactionKind` enum to `text`, and the enum is dropped. `Update` gets `reactionKinds String[]`, defaulting to the usual six, so existing updates keep the six. A set is always stored in catalog order with no duplicates, so "Use the usual reactions" is checked exactly when the stored set equals the usual six.
- **The server decides what's allowed.** Each reactions view gains `allowed: string[]`: the update's set, or the usual six for a note. The client draws the tray from `allowed` plus the viewer's own reaction and never computes the set itself.

## Steps

1. **Catalog module and its unit tests.** `src/lib/reactionCatalog.ts` is plain data: the groups and entries, `USUAL_REACTIONS`, and `inCatalogOrder(kinds)`. The server already imports values from `src/lib` (`server/richText.ts`). `parseReactionSet(input)` lives in `server/reactions.ts`. It takes an array of unique catalog kinds, at most six, and returns them in catalog order. Anything else throws a `RequestError(400)`: a non-array, an unknown kind, a duplicate, or more than six. `src/reactions.ts` switches from its own `REACTIONS` list to the catalog.
2. **Migration.** It's written by hand, per `claude/lessons.md`, in `prisma/migrations/20261022000000_per_update_reactions/`. The name has to sort after the existing `20261021000000_help_message`. `ALTER COLUMN "kind" TYPE text USING "kind"::text` on both reaction tables, `DROP TYPE "ReactionKind"`, and `ADD COLUMN "reactionKinds" text[] NOT NULL DEFAULT ARRAY['heart','hug','strong','clap','party','laugh']`. Then confirm `prisma migrate diff` shows no drift.
3. **Server.**
   - `createUpdate`'s and `editUpdate`'s `input` types gain `reactions`. When it's absent, `createUpdate` gives the usual six (used by old callers and tests) and `editUpdate` leaves the set alone. When present, it goes through `parseReactionSet` before any write. In `editUpdate` that means right after the video check, so an invalid set fails before photo rows change. Both the text and the video `tx.update.create` write `reactionKinds`. Video edits are already refused.
   - `setReaction` makes one check: a non-null `kind` must be in the target's set, meaning the update's `reactionKinds` for an update or the usual six for a note. A kind outside it is a 400, "That reaction isn't available here." That also covers unknown kinds, since every set is drawn from the catalog. Clearing (`kind: null`) skips the check. The update branch and the note branch each get their own check.
   - `reactionsView` takes the allowed set and returns it as `reactions.allowed`, sorting `kinds` in catalog order instead of enum order. `listUpdates` passes the update's `reactionKinds`; `noteView` passes the usual six.
   - The API handlers already pass the whole body through, so they need no change.
4. **Reaction controls.** `ReactionControls` draws its tray from `allowed`, adding the viewer's own kind when it's outside the set, all in catalog order. If that list is empty, the React button is hidden, while the summary still shows. Accessible names come from the catalog.
5. **Post settings.** A `PostSettings` component in `src/components/postSettings.tsx` is a toggle button showing the summary line and, when open, the optional notify checkbox and the "Use the usual reactions" checkbox with the grouped grid and its "n of 6 chosen" count. `PostForm` uses it with both settings on both tabs and always sends `reactions`. After a successful post, `submit` resets the set to the usual six and closes the section, as it already resets `notify`. The edit view uses it with only the reactions setting, starting from the update's current `reactions.allowed`, and sends `reactions` with the content. `onPost` and `onEdit` in `Feed.tsx` grow to carry the set.
6. **Checks by hand in the browser pane.** Post with the usual six, with a custom set including 💀 and 🖕, and with none. Then edit a set to drop an emoji someone reacted with, and confirm the reaction stays and can still be removed, while others can't pick it. Also check the summary line, the 6-item limit, the phone width, and the video tab's settings.

## Tests

Integration tests, against Postgres, in `tests/integration/reactions.test.ts` and `updates.test.ts`. The existing whole-object assertions (the `none` constant and the other `toEqual` checks on `reactions`) gain `allowed`.

- A reaction with a catalog emoji outside the update's set is refused, and nothing is stored. One inside a custom set (💀) is accepted.
- On an update with an empty set, every reaction is refused.
- After an edit drops an emoji, an existing reaction with it stays in the view and is counted, and its owner can still clear it, but can't set it again and nobody else can pick it.
- A note reaction with a catalog emoji outside the usual six is refused.
- `allowed` in the view equals the update's set in catalog order, or the usual six for notes.
- Creating or editing with an invalid set (more than six, a duplicate, an unknown kind, or not an array) is a 400 and changes nothing. A video update can be posted with a custom set.
- A supporter's edit carrying `reactions` is refused and leaves the set unchanged. The existing family-member check covers it, but the new input gets its own test.

Each set test is proven to fail with its own check removed: the update branch's check for the first three, and the note branch's separately for the fourth, since removing one leaves the other's test passing. The supporter test is proven to fail with `requireFamilyMember` removed from `editUpdate`.

Unit tests: `parseReactionSet` (ordering, each rejection), and the summary's catalog-order tie-break in `src/reactions.test.ts`.

## Cut for speed

- **A simultaneous edit and reaction can race.** `setReaction` reads the set and then writes without a lock, so a reaction checked against the old set can land just after an edit removes that emoji. The result is the same as a reaction given just before the edit, which the spec already keeps, so no lock.
- **No skin-tone variants**, as the spec says.
- **Older devices may draw some catalog emoji as boxes.** 🫶 🫠 🫡 🥹 are from Emoji 14 (2021), which some older Windows and Android devices lack. They're only offered when a family picks them.
- **Note sets, "Allow notes," and settings for video updates** are separate backlog entries in `NEXT-SESSION.md`.
- **Preview database.** The migration changes the schema, so the shared preview branch may need recreating if another open PR also migrates (README → Deployment).
