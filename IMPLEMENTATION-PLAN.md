# Implementation Plan: Notes and the Wall

Lets everyone signed in to a family leave colored notes of support on an update, read them under the update, and see them all together on the family's wall. When it lands, a supporter can open "Leave a note" on any update, write a note, pick its color, and sign it with their name.

Spec sections covered: `spec/updates.md` → Notes (all of it) and Deleting; `spec/access.md` → the note-related lines in Families, Managing supporters, and Stated limits; `spec/MASTER_SPEC.md` → MVP scope.

## How to read this plan

Milestones run in order, and each ends with a **Verify** step. Mark each `✅` when it passes. Notes carry health-adjacent personal messages, so who may read, write, and delete them is enforced in `server/notes.ts` and covered by integration tests against Postgres. The UI is verified in the browser pane.

## Design

### Data

A new `Note` model:

```prisma
// The palette's colors; the UI maps each to a fill and a text color.
enum NoteColor { sky teal sage oak rose lavender }

// A note of support on an update. Anyone signed in to the family may leave any number.
model Note {
  id        String    @id @default(cuid())
  updateId  String
  authorId  String
  body      String
  color     NoteColor
  createdAt DateTime  @default(now())

  update Update @relation(fields: [updateId], references: [id], onDelete: Cascade)
  author Person @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([updateId, createdAt])
}
```

The color is stored as a palette key, never a hex value, so the server can reject anything outside the palette and the palette can be retuned in one place. There's no `familyId` column: a note's family is its update's family, and every query scopes through `update.familyId`.

`Person` and `Update` get `notes Note[]` back-relations. The `Person.name` comment changes: a supporter may now have a name without an email. `supporterView`'s comment says the People page lists supporters by email, not name, so name-only supporters stay unlisted.

Migration SQL is written by hand (see `claude/lessons.md` → Commands that fail in an agent's shell).

### Server: `server/notes.ts`

- **`visibleNotes(familyId)`**: the one Prisma filter for notes anyone may see, `{ update: { familyId }, author: { familyId, removedAt: null } }`. The wall, the feed, and the counts all use it, so they can't drift apart. Filtering on the author's family too, rather than trusting how notes were written, matches reactions.
- **`createNote(db, person, { updateId, body, color, name })`**, in one transaction:
  - Validates the body (trimmed, 1–1,000 characters, counted with `.length` on both server and client) and the color (one of the enum's values).
  - Locks the author's row with `SELECT name … FOR UPDATE`, matching only an active person in the person's own family; no row → 403. A removal running at the same moment either lands first, refusing the note, or waits until it's written, so a removed person's note is never written after their removal.
  - Decides the signature from that **locked** row, never the session's `person`, which can be stale. With no stored name, `name` is required (`validName`) and saved in the same transaction. With a stored name, `name` is ignored, so no one renames themselves through a note. The lock also serializes the hourly count below.
  - Finds the update within `person.familyId`; another family's update → 404. The create maps a foreign-key error (P2003, the update deleted a moment ago) to 404, caught outside the transaction as `addFamilyMember` does.
  - Refuses a 21st note from the same person within an hour (429, "You've left a lot of notes. Please try again later."), so one person with the answer can't flood the wall.
  - Returns `{ note, name }`, so the client updates the signed-in person's name without reloading.
- **`validName`** is extracted from `validNameAndEmail` in `server/families.ts`, with the same rule and message, and used by both.
- **`listNotes(db, person)`**: every visible note in the person's family, newest first, for the wall.
- **`deleteNote(db, person, id)`**: `deleteMany({ where: { id, ...visibleNotes(familyId), ...(role === "family" ? {} : { authorId: person.id }) } })`. The family scope applies in both branches. Count 0 → 404, so a note the person can't delete looks the same as one that doesn't exist.
- **Notes in the feed:** `listUpdates` includes each update's visible notes, newest first, through a shared `noteView`, so the feed needs no second request.
- **`addEmail` keeps an existing name.** A supporter who already has a name (from a note) keeps it when giving an email: the name is written only where `name` is null, and the client's email form leaves out the name field for them. Otherwise giving an email could silently re-sign every earlier note.

A note's view: `{ id, updateId, body, color, authorName, authorIsFamily, createdAt, mine }`. `mine` tells the client whether to show Delete to the author; family members see Delete on every note. `authorIsFamily` gives family members' notes a small "Family" marker, which a supporter can't fake by signing with a family member's name. Never author IDs or emails.

### API

Thin handlers, as for reactions:

- `api/f/[slug]/notes/index.ts`: `GET` (the wall), `POST` (leave a note).
- `api/f/[slug]/notes/[id].ts`: `DELETE`.

### Client

- **Palette** in `src/notes.ts`: the six keys, each with its fill and text color (all meet WCAG AA; contrast 5.8–7.3):

  | key | fill | text | from |
  |---|---|---|---|
  | sky | `#DCEBF7` | `#1B5C8C` | Ocean Blue |
  | teal | `#DCEBEA` | `#2D5254` | Stormy Teal |
  | sage | `#E6EEE4` | `#3D5A40` | Ash Grey |
  | oak | `#F3EEE2` | `#5E5136` | Pale Oak |
  | rose | `#F9E3E1` | `#8C3341` | added for warmth |
  | lavender | `#ECE6F5` | `#553C80` | added for warmth |

  Plus a `randomColor()` helper.
- **`NoteCard`**: a card filled with the note's colors, body (linkified, line breaks kept), "— Name", time, and Delete with the shared inline `Confirm` when allowed.
- **`NoteDialog`**: shadcn `dialog` (new component, `npx shadcn add dialog`; it uses the `radix-ui` package already installed). Holds a textarea styled as the note card in its current color, a row of round color swatches (radio buttons under the hood, so they work from the keyboard and screen readers), the "Your name" field when the viewer has no name, and "Leave note" / "Cancel".
- **Feed**: each update gets "Leave a note" and an "N notes" toggle beside the reactions; open notes render as a 1-column (phone) / 2-column (desktop) grid of `NoteCard`s. Deleting an update with notes says its notes will be deleted too.
- **Name after the first note:** `FamilyHome` passes an `onNamed` callback down; the POST's returned `name` updates `me.person.name`, so the dialog stops asking, the header menu shows who is signed in, and the email form drops its name field.
- **Wall page** `src/pages/Wall.tsx` at `/f/<slug>/wall` (added to `FAMILY_PATH` in `App.tsx`): `PageShell` with the family's name, CSS `columns-1 sm:columns-2 lg:columns-3` masonry of `NoteCard`s with `break-inside-avoid`. Signed out (401) → `location.replace` to the family's home page, which shows the gate, so Back doesn't loop. Titled "Notes of support" with the family's name under it, and linked as "Notes" beside the header menu.
- **Email prompt** leaves out the name field when the viewer already has a name.

## Tests

Integration (`tests/integration/notes.test.ts`), each access test proven able to fail by removing its rule:

1. **Family isolation:** a note can't be left on, or deleted from, another family's update (404). Notes inserted directly with a cross-family author, in both directions, appear on neither family's wall or feed, proving the update filter and the author filter separately.
2. **Output shape:** no author IDs or emails anywhere in the wall or feed JSON; `mine` is true only for the author; `authorIsFamily` only for family members.
3. **Deleting:** a supporter can delete their own note but not someone else's; a family member can delete anyone's.
4. **Removal:** a removed supporter can't leave a note; their notes are hidden from the wall, the feed, and the counts, and come back when they're restored. The same for a removed family member, restored by adding them again.
5. **Names:** a supporter without a name must give one, and it's saved on their record. A supporter with a name can't change it through a note, and keeps it when giving an email with a different name. A nameless reader who reacted and then leaves a note appears by name in the reactions.
6. **Flows that keep notes:** a promoted supporter keeps their notes as `mine`, signed with the name entered at promotion. A nameless author signed out by an answer change keeps their notes. A name-only supporter isn't on the People page.
7. **Validation:** a bad color and an empty, whitespace-only, or 1,001-character body are refused; the 21st note in an hour is refused.
8. **Deleting an update** deletes its notes.
9. **Endpoints:** GET, POST, and DELETE are refused signed out (401), with a wrong method (405), and at an unknown address (404).

Unit: `randomColor()` returns only palette keys; every palette pair meets 4.5:1 contrast (computed, so a retune can't break it); `linkify` makes no link from `javascript:` or `data:` text, since notes come from a wider group than updates.

## Milestones

### 1. Data and server ✅

Schema, migration, `server/notes.ts`, notes in `listUpdates`, the API handlers, and the integration tests.

**Verify:** `npm run typecheck` and `npm test` pass; each access test fails when its rule is removed.

### 2. Notes on the feed ✅

Palette, `NoteCard`, `NoteDialog`, the feed's "Leave a note" and notes toggle, the update-delete count, the email prompt's prefilled name.

**Verify:** in the browser pane at 375px and desktop width: as a nameless supporter, leave a note (asked for a name), change its color, see it under the update; leave a second without being asked; delete your own; as a family member, delete someone else's and delete an update with notes.

### 3. The wall ✅

`Wall.tsx`, the route, the header link.

**Verify:** the wall shows every note newest first in columns at both widths; signed out, it shows the gate.

### 4. Names shown, notes beside updates ✅

From Melissa's first look at the preview:

- **Names, read-only.** `NoteDialog` takes the viewer's `name` (or null) instead of `needsName`: with a name, "Your name" shows it in a read-only field; without one, it's an empty required field. `EmailPrompt` shows a stored name the same way. The server already ignores a name sent by someone who has one, so this is display only.
- **Notes beside updates, always shown.** The "N notes" toggle goes. The feed's server order becomes newest first. On `lg` screens the family home page widens (`PageShell` gets a `wide` option, `lg:max-w-6xl`), and each update becomes a two-column grid row: the update card (42rem) on the left, its notes stacked on the right. The email prompt spans both columns; the notification setting and post form keep the update card's width. On smaller screens the notes sit below the card.
- **Six, then a link.** Each update shows its six newest notes. With more, "See all N notes" links to `/f/<slug>/wall#update=<id>`. The update ID goes after `#` because preview logins drop query strings.
- **Wall filtered by update.** `Wall` reads `#update=<id>` (and listens for `hashchange`) and shows only that update's notes. A bar above them always says the filter is on, naming the update's author, date, and first line, with a "Show all notes" button that clears it. The filter is client-side over the notes it already loaded, since every visible note in the family is already the reader's to see.

**Verify:** at 375px and desktop width: a named reader sees their name read-only in both forms; a nameless reader types it once; notes sit beside the update on desktop and below on phones; an update with seven notes shows six and the link, and the link shows only its notes on the wall.

### 5. Ship

Typecheck, test, PR, CI, `npm run preview:seed` and `npm run preview`, and hand Melissa the preview link with what to try.

## Discoveries

- The database had a check constraint, `Person_name_with_email`, requiring name and email to be both set or both empty. The notes migration replaces it with `Person_email_has_name` (an email still requires a name), since a note's author may have a name and no email.
- `addEmail` keeps a stored name. If a note set the name between `addEmail` reading the row and writing it, the write matches nothing and returns 409 "Please try again." rather than overwriting the note's name.
- The color swatches use Radix's radio group primitive directly (from the `radix-ui` package already installed), so only shadcn's `dialog` was added. The feed's link rendering moved into a shared `LinkedText` in `src/components/page.tsx`, used by updates and notes.
- The note dialog decides whether to ask for a name when it opens. Deciding it live made the name field vanish mid-submit, as soon as the saved name reached the page.
- Verified in the browser pane at 375px and desktop width: a nameless reader is asked for a name once, then not again; "Signed in as" appears; the email form asks only for an email; deleting one's own note confirms inline; a family member sees Delete on every note, the "Family" marker on their own, and "Delete this update and its note?"; a name sent with a family member's note is ignored. No sideways scroll at 375px.
- The wall's CSS columns fill top to bottom, so "newest first" reads down the first column, then the next. Verified at 375px (one column, no sideways scroll) and desktop width (two to three columns); a signed-out visit lands on the gate.
- `src/linkify.test.ts` already covers `javascript:` and `data:` text, so the unit tests need no new linkify case.
- Each access rule in `server/notes.ts` and `addEmail`'s name rule was removed in turn; every removal failed at least one test.

- Verified the side-by-side feed at an emulated 1280px width (the pane itself is under the `lg` breakpoint), stacked notes at 375px with no sideways scroll, read-only names in both forms, "See all 7 notes" opening the wall filtered with its bar, "Show all notes" clearing it, and Back restoring it.

## Cut for speed

- **Editing notes.** Delete and leave another instead. In the spec's Later list.
- **Emailing the family about new notes.** Notes send nothing.
- **Linking a wall card back to its update.** The wall shows the note and when it was left.
- **Unread markers, filtering, search** on the wall. In the spec's Later list.
- **Listing name-only supporters on the People page.** The family moderates by deleting notes and, if needed, changing the answer (spec → Stated limits).
