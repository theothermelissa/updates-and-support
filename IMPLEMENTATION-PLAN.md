# Implementation Plan — The family's message on How to help

Adds a message the family writes at the top of How to help, such as "Please don't send flowers or gift baskets," as described in `spec/updates.md` → "The family's message," and shows supporters the "How to help" link once the family has a message or a request (`spec/MASTER_SPEC.md` → "Look and feel").

## Data

One hand-written migration, `prisma/migrations/20261021000000_help_message/`:

- `Family.helpMessage String?`: the message as saved, trimmed, 1 to 2,000 characters; null when there is none.

A new nullable column is safe for the code already running, which matters because production migrates before the new code goes live. Confirm with `prisma migrate diff` that the schema and migrations agree.

## Server (`server/help.ts`)

- **`helpMessage(db, person)`** returns the message of the person's own family (`where: { id: person.familyId }`), or null. Like `listHelp`, it trusts its caller to have checked that the person is signed in to the family. It reads by the person's family rather than the family the handler loaded from the address, because the address can be redirected (`FAMILY_REDIRECTS`) while the session is matched to the address as typed.
- **`setHelpMessage(db, person, { message })`** calls `requireFamilyMember` first. `message` must be a string (400 otherwise); it is trimmed, an empty one saves null, and over 2,000 characters is a 400. It updates only `person.familyId`'s row and returns `{ message }` as saved.

## API

- `GET /api/f/[slug]/help` returns `{ message, requests }`. Tabs still running the previous code ignore the new key.
- New `api/f/[slug]/help-message.ts`: `PUT { message }` calls `setHelpMessage` and returns `{ message }`; 401 without a session for this family; 405 for any other method. It goes through `familyContext`, so its responses are `no-store` like every family response. A separate file rather than a `PUT` on `help/`, whose `PUT` the endpoint tests expect to refuse.
- `api/f/[slug]/me.ts` adds `family.hasHelpMessage` and keeps `hasHelpRequests` as it is. Tabs opened before the deploy read `hasHelpRequests` and fetch `me` again after an offer, so renaming it would hide their "How to help" link until a reload.

## Frontend

- `src/api.ts` and `src/components/familyShell.tsx`: the navigation bar shows "How to help" to family members, as now, and to supporters when `hasHelpRequests` or `hasHelpMessage` is true. The link is a convenience; the page itself is open to everyone signed in to the family.
- `src/pages/Help.tsx`: the page loads `message` with the requests, and a new `HelpMessage` component sits under the heading (and any error), above "What Would Help":
  - With a message: a shaded box (`rounded-xl bg-muted p-4`, unlike the white request cards) showing it with `LinkedText`, and for family members a small **Edit** button at its top right.
  - Without one: family members see an outline **Add a message for supporters** button; supporters see nothing.
  - Editing: a text box (2,000 characters, labeled for screen readers, with an example as its placeholder) with **Save** and **Cancel**. The box isn't `required` and Save stays enabled when it's empty, since saving an empty box removes the message. Save goes through the page's existing `change` helper, which shows any error and reloads the page's data; Cancel discards the edit.

## Tests

Integration, in `tests/integration/help.test.ts` against real Postgres. Each access test is proven to fail with its rule removed.

1. **Everyone signed in to the family reads the message, and no other family does.** Ana writes it; Luis (family) and Sam (supporter) read it; Chidi and Olu, of the Okafor family, read null. Luis changes it and Sam reads the change; Ana saves only spaces and it's gone. *Breaks if* `helpMessage` isn't limited to `person.familyId`.
2. **A supporter can't write it.** Sam's save is refused with 403, and the message is unchanged. *Breaks if* `requireFamilyMember` is removed.
3. **A family member writes only their own family's message.** Chidi saves one for the Okafors; the Riveras' is unchanged. *Breaks if* the update isn't limited to `person.familyId`.
4. **The endpoints**, in "the help endpoints" block. Its request helper also returns the response body, as the one in `photos.test.ts` does.
   - `PUT help-message` with no session, or with another family's session, gets 401 and changes nothing; `GET` on it gets 405. Ana's `PUT` saves the message. *Breaks if* the handler's sign-in check is removed.
   - `GET help` with Sam's session returns the message; without a session it gets 401 and the body doesn't contain the message.
   - After Ana saves the message, `GET gate` with no session returns a body that doesn't contain it. `familyContext` loads the family row fresh, so this fails if the gate ever sends the row. *Breaks if* the gate handler's response includes the family row.
5. **Validation** (not an access rule, so no removal proof): over 2,000 characters or not a string gets 400, and surrounding spaces are trimmed.

Browser check on a local server: as a family member, add, edit, and remove the message; as a supporter, see the box and the navigation link when the family has a message and no requests, and no box when there's none; check a long message at 360px wide.

Preview: a cloud session can't seed the preview database or sign the browser pane in, so Melissa checks the preview with `npm run preview:sign-in` from her Mac.

## Cut for speed

- Plain text only, like request descriptions: no bold or real bulleted lists. A line starting with "- " reads as a list.
- If two family members edit at once, the last save wins, with no warning.
- Others see a change when they next load the page, as with requests.

## Discoveries

- Every access test was run with its rule removed and failed each time: reading any family's message, saving without the family-member check, saving to every family's row, the gate sending the family row, and the message endpoint without its sign-in check.
- Browser check on a local server at 360px and 1280px, as a family member and a new supporter: Add, Cancel, Save, and Edit work; saving an empty box removes the message; a supporter sees "How to help" when the family has only a message, and loses it once the message is removed; an address in the message is a link that wraps on a phone; nothing scrolls sideways. Type check and all 342 tests pass.
