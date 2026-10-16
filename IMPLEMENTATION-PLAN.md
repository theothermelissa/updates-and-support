# Implementation Plan — Help request requirements and dates

Adds "Require name," "Require email," and an optional date and time to How to help requests, as described in `spec/updates.md` → "How to help" and the help paragraph of `spec/access.md` → "Stated limits."

## Data

One hand-written migration, `prisma/migrations/20261019000000_help_requirements/`:

- `HelpRequest.requireName Boolean @default(true)`: existing requests keep needing a name.
- `HelpRequest.requireEmail Boolean @default(false)`.
- `HelpRequest.date String?` as `YYYY-MM-DD`, and `HelpRequest.time String?` as `HH:MM` (24-hour). Strings rather than Postgres `date`/`time`, because Prisma turns `@db.Date` into a JavaScript `Date` at UTC midnight, which shifts the day in western time zones. A string is exactly what was typed and can't drift.
- `HelpOffer.email String?`: the email given with that offer, lowercased and trimmed. Deleted with the offer.

Confirm with `prisma migrate diff` that the schema and migrations agree.

## Server (`server/help.ts`)

- **Request input.** `createHelp` and `updateHelp` take `{ body, slots, requireName, requireEmail, date, time }`. All six fields are required on both: the booleans must be booleans, and `date` and `time` must be present (null for none). Defaulting a missing field would let a tab still running the previous version silently turn off Require email and erase the date when it edits a request after deploy; refusing it means that tab gets an error and a refresh fixes it. `date` is null, or a real calendar date (`2026-02-30` refused); `time` is null, or `00:00`–`23:59`, and refused without a date. An empty string counts as null, since that's what an empty date input sends.
- **The view** adds `requireName`, `requireEmail`, `date`, and `time`, and an offer's `name` becomes `string | null` (null shows as "Someone"). A family member's `email` is `offer.email ?? person.email` (an offer has its own email only when the record had none). A supporter's offers still get `email: null`, their own included.
- **Anonymous offers count.** Remove `name: { not: null }` from `requestInclude` and from the "places taken" count in `offerHelp`. Every existing offer has a named author, so this changes nothing for existing data.
- **`offerHelp`** reads `requireName` and `requireEmail` in the same locked `SELECT ... FOR UPDATE`, and reads the author's `email` in the author lock:
  - Name: asked for (and put on the record) only when `requireName` and the author has none. Otherwise a missing name is fine and any `name` sent is ignored.
  - Email: when `requireEmail`, the author has no record email, and this is a new offer, `input.email` must pass `isValidEmail` after `normalizeEmail`, and is stored on the offer. Otherwise any `email` sent is ignored, so it can never be stored where it wasn't asked for.
  - Both are checked before anything is written, so a refused offer stores nothing (no half-saved name).
  - The response stays `{ name }`; the email is never echoed back.
- The offer endpoint's comment documents `email?`. Request handlers' comments document the new fields.

The server does not refuse offers on a past request: "past" depends on the viewer's clock (spec says so).

## Frontend

- **`src/help.ts`** gains pure functions, unit-tested:
  - `isPast(date, time, now)`: date only → past from the next day's start; date + time → from that minute; by the device's local clock.
  - `sortRequests(requests, now)`: upcoming dated (date, then no-time before times, then time), then undated in server order (oldest first), then past, most recently past first.
  - `whenLabel(date, time)`: "Fri, Oct 17" or "Fri, Oct 17 · 5:30 PM".
  - Both `isPast` and `whenLabel` build a local `Date` from the parts with one shared helper, so there's no time zone shift and no second, subtly different parse.
- **`src/pages/Help.tsx`**:
  - The request form gets "Require name" (checked) and "Require email" checkboxes and native `<input type="date">` and `<input type="time">` fields, each optional. The time field is disabled until a date is set; clearing the date clears the time.
  - The card shows the date line above the body, strikes through a past request (no check), and hides the offer button on a past or covered request for anyone who hasn't offered.
  - Offering asks for "Your name" when `requireName` and the viewer has none, and "Your email" ("Only the family will see this.") when `requireEmail` and the viewer has no email, both on the same press.
  - The family's offer list shows "Someone" for an offer without a name; the remove confirmation says "Remove this offer?" for it.

## Tests

Integration (`tests/integration/help.test.ts`, real Postgres). Each is proven to fail with its rule removed.

1. **Anonymous offers count and fill places.** On a 1-place request with Require name off, a nameless reader offers with no name; the family sees one offer named null, and both the family and a supporter see `offered: 1` and `full: true`; a second supporter is refused with 409. *Breaks if* either `name: { not: null }` filter stays.
2. **A named person stays named** on a no-name request, and a name sent there isn't saved for a nameless reader. *Breaks if* the name step ignores `requireName`.
3. **Require email is enforced on the server.** On a request requiring a name and an email, a nameless reader with no record email sends a valid name with a missing email, then with an invalid one: both are refused, there is no offer, and their name is still null. With one, it's stored on the offer only: the person's record email stays null. *Breaks if* the email check is removed.
4. **The offer's email is seen only by family.** The family sees a distinctive email such as `given@offer.test`; it appears nowhere in the JSON of the offerer's own list, another supporter's list, or the `offerHelp` response; another family's member sees no request at all (covered by the existing isolation test). *Breaks if* the view's `family ?` guard on email is removed.
5. **Record email is reused.** A supporter with a record email offers on a Require-email request without giving one; the family sees the record email, and the offer row's email is null. An email sent on a request that doesn't require one isn't stored. *Breaks if* the "only when asked" condition is removed.
6. **Request fields are validated and stored.** A family member's request round-trips its booleans, date, and time; bad dates, a time without a date, non-boolean flags, and an edit missing any field get 400. (Not an access rule; one test, no mutation proof.)

Unit (`src/help.test.ts`): `isPast`, `sortRequests`, and `whenLabel`, including date-only versus time-of-day boundaries.

Browser check: as a family member (localhost) and a supporter (127.0.0.1), add requests with each setting, offer anonymously and with an email, and confirm order, strike-through, and that the supporter never sees an email.

## Cut for speed

- "Require phone": waits for the phone-notifications work.
- No server-side refusal of offers on past requests (by design; it depends on the viewer's clock).
- No way to edit the email given with an offer; withdraw and offer again.
- Native date and time pickers, not a custom design.
