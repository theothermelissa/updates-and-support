# Implementation Plan — Privacy banner

Spec: [access.md → The privacy banner](spec/access.md#the-privacy-banner), and the "privacy banner" bullets in [MASTER_SPEC.md](spec/MASTER_SPEC.md).

## Approach

The family's wording is one nullable column. `null` means "use the standard wording," so the standard wording lives in code in exactly one place, and an empty save just stores `null`. Signed-in pages get the family's wording from `/me`, which they already load. Every other page shows the standard wording and needs no request, so the gate exposes nothing new.

## Steps

1. **Schema.** Add `privacyNotice String?` to `Family`, with a comment. Hand-write the migration `prisma/migrations/20261026000000_privacy_notice/` (`ALTER TABLE "Family" ADD COLUMN "privacyNotice" TEXT;`), sorting after `origin/main`'s newest migration. Check for drift against a scratch database.
2. **Standard wording.** Create `src/lib/privacyNotice.ts`, exporting `STANDARD_PRIVACY_NOTICE` and `MAX_PRIVACY_NOTICE = 300`. The server imports these too, as it already does for `src/lib/doc.ts`.
3. **Server.** In `server/people.ts`:
   - `setPrivacyNotice(db, person, { privacyNotice })` calls `requireFamilyMember`, collapses runs of whitespace (including line breaks) to single spaces, trims the result, and stores an empty string as `null`. It refuses a non-string or anything over 300 characters with a 400, writes only to `person.familyId`, and returns `{ privacyNotice }`.
   - `listPeople` also returns `privacyNotice`.
4. **API.**
   - New `api/f/[slug]/privacy-notice.ts`: PUT, shaped like `notes-default.ts`.
   - `api/f/[slug]/me.ts` adds `family.privacyNotice` (string or null), since every signed-in reader needs it.
5. **Banner component.** `src/components/privacyBanner.tsx` renders `<PrivacyBanner text?>`: a full-width, muted, tinted strip with small centered text, and `text ?? STANDARD_PRIVACY_NOTICE`. It is plain text rendered by React, never HTML.
6. **Placement.** The banner is placed only in `App.tsx` and `FamilyFrame`, never inside a page component. `People` renders `NotFound` inside the shell, so a banner inside `NotFound` or `Gate` would show twice.
   - `FamilyFrame` renders the banner with `me.family.privacyNotice` above `FamilyShell`, and the standard banner above `Gate` and above its own `NotFound`. The frame stays mounted while readers move between pages, so the banner doesn't flicker. While the gate loads, the banner briefly shows alone. That's expected.
   - In `App.tsx`, every return that isn't `FamilyFrame` or `null` gets the standard banner: family sign-in, sign-in, verify, unsubscribe and not-found.
   - Loading states that render `null` show no banner.
7. **People page.** Add a "Privacy banner" section after "Notes on new updates": a textarea, starting empty when `privacyNotice` is `null`, with `maxLength=300`, a Save banner button, an inline status, and the explanation and standard wording from the spec. A successful save calls `reloadMe()`, so the banner updates right away.
8. **Types.** Add `privacyNotice: string | null` to `Me.family` in `src/api.ts`, and to the `People` type in `People.tsx`.

## Tests

Integration tests go in `tests/integration/privacyNotice.test.ts`, with the Rivera family plus supporter Sam, and the Okafor family:

- A family member saves wording. `listPeople` returns it, and Okafor's `privacyNotice` stays `null`. This is a sanity check, not an access test.
- A supporter is refused with a 403, and the family's `privacyNotice` is still `null` in the database. **Prove this test can fail:** remove `requireFamilyMember` and watch it fail.
- Saving a blank or whitespace-only string stores `null`, and line breaks are saved as single spaces. A non-string, or 301 characters, is refused with a 400.

`/me` returning the field is glue. I'll verify it in the browser rather than with a test.

## Verification by hand (browser pane)

- On the gate, before signing in, the standard banner shows at 360px with no sideways scroll.
- Signed in as a family member, save custom wording on People and check that the banner changes right away and stays the same across Updates, How to help and Notes.
- Clearing the box brings back the standard wording.

## Cut for speed

- No preview of the banner inside the People page section; the real banner at the top shows the result once saved.
- Other readers see changed wording on their next page load. Nothing pushes the change live to them.
