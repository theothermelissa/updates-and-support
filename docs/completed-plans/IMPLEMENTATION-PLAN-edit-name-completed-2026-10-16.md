# Implementation Plan — Changing your name

Implements `spec/access.md` → "Changing your name," and the menu, note dialog, and email form described there and in `spec/updates.md`. One session. No new dependencies, no schema change. Email addresses stay as they are.

## Design

A person has one name, on their record. Notes, reactions, and updates already read that name when they render, so saving a new one re-signs everything they've already left. Nothing stores a copy of the name at the time it was written.

**Server.** `setOwnName` in a new `server/name.ts` takes the signed-in person and a name, runs it through the existing `validName` (trim, 1 to 100 characters), and updates that person's row only. There is no person id in the request, so one person can't rename another. A removed person has no session, so they never reach it; the handler checks the session the same way the other routes do.

`POST /api/f/<slug>/name` with `{ name }` calls it and returns `{ person }` in the same shape as `me`. The handler is thin, like `notifications.ts`.

**Leave a note.** `createNote` already locks the author's row. It keeps using the stored name when the request omits one and they have one. When the request includes a name, that name is validated and, if it differs, saved in the same transaction as the note. A note that fails validation, the hourly limit, or anything else saves no name. Someone with no name must still send one.

**Adding an email.** `addEmail` uses the name in the body when the request has one, and the stored name when it doesn't. That name is written only on the path that attaches a new email to this supporter, in the same update as the email. An email that already belongs to someone in the family, or that can't be added, still changes nothing, name included. The existing check that the row still has no email, and still has the name it had at the start of the request, stays: a name that changed in that moment returns "Please try again" and writes nothing.

**Feed menu.** With "Signed in as," above the line, an "Edit name" item, only when they have a name. It opens the existing dialog: the name filled in, the line "This is the name people see for you," Save, and Cancel. Save posts to `name` and puts the returned name on the signed-in person. Cancel discards. The field is required.

**Leave a note.** The name field is always editable, filled in from their record, or empty if they have none. Posting sends the name. The feed already reloads after a note; it also takes the returned name, whether or not they had one before, so "Signed in as" updates.

**Email form.** The name field is always editable. Until they type in it, it shows the name on their record, including one a note just saved while the prompt was already on the page. Submitting sends that name only if they changed the field. An untouched field sends no name, so a name saved from the menu or a note is kept. Cancel still just closes the form.

**Feed already on screen.** When the signed-in name changes, the feed reloads, so notes, reactions, and updates already visible show the new name. The wall and the People page read the record on their next load; neither gets new UI.

## Tests

Integration tests, against Postgres:

- `setOwnName` stores a trimmed name. That person's existing note, reaction, and (for a family member) update then show the new name. Another person in the family is unchanged.
- An empty name, a blank name, and a name over 100 characters are refused, and the record is unchanged. Saving the same name leaves it as it was.
- A note that includes a different name stores it and re-signs that person's earlier note and reaction. A note that omits the name keeps the stored one. A reader with no name is still refused until they send one, and a refused note stores nothing.
- Giving an email with a different name stores that name and re-signs their note. Giving an email with no name in the body keeps the stored name. Giving an email that already belongs to the family still changes nothing, including the name. The existing "invalid name or email changes nothing" and "removed address changes nothing" tests stay as they are.

The note test that a note can't change an existing name, and the one that an email keeps a note's name, are rewritten to the behavior above. Those were the old rule.

No UI tests. Check by hand in the browser, at 360px and desktop width:

- A family member: Edit name from the menu, see "Signed in as" and an update they posted change, Cancel leaves the name.
- A supporter who has a name: change it from the menu, and from Leave a note, and see an earlier note and reaction follow.
- A supporter with no name: the menu has no Edit name; Leave a note still asks for one; the email form's name is editable and a new email saves it.
- An empty name can't be saved from the menu, the note, or the email form.

## Cut for speed

Changing an email stays deferred. The wall doesn't get this menu. There is no profile page; the menu dialog is the whole of that idea.

## Results

Typecheck passed, and all 288 tests passed. The two rewritten rules were shown failing with the old behavior put back: a note that sends a new name, and an email that sends a new name.

Checked by hand on a fictional local family, at desktop width and at phone width: a family member's Edit name, Cancel leaving the byline, and Save changing it; a supporter with no name seeing only Sign out; Leave a note requiring a name; the email form showing a name a note just saved, and Cancel leaving it.

Melissa checked a preview and asked for Edit name to sit with "Signed in as," above the line. That change is in this branch, and she approved shipping it. The backlog entry for a profile page was removed.
