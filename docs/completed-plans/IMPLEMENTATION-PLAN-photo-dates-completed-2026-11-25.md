# Implementation plan: dating an update from its photos

Spec: [updates.md → Dating an update from its photos](../../spec/updates.md#dating-an-update-from-its-photos), plus the Posting and Editing sections and the bullet in [MASTER_SPEC.md](../../spec/MASTER_SPEC.md).

## Approach

Photos already lose their embedded details at Cloudinary (`fl_force_strip`), so stripping needs no change. The work is: read each photo's date in the browser before upload, let the family member see and change it, and let the server accept a `postedAt` that becomes the update's `createdAt`. No schema change: `createdAt` is the posted date, and the feed already sorts by it.

## Server

1. `server/postedAt.ts`: `parsePostedAt(value, now = new Date())` returns `Date | undefined` (absent means "leave it"). It throws `RequestError(400, "Choose a date between 1900 and now.")` for a non-string, an unparseable string, a date before 1900-01-01, or a date after `now`. ISO strings only.
2. `createUpdate` (text path): `createdAt: postedAt` in the create data when given. A `postedAt` sent with a `video` is refused with 400 ("Only photo updates can be dated").
3. `editUpdate`: `createdAt: postedAt` in the update data when given. It never emails (edits never do), and, like any edit, sets `editedAt`.
4. Authorization is unchanged: both functions already call `requireFamilyMember` first, and `postedAt` is parsed after it.

## Client

5. Add `exifr` (exact version, lite build: reads JPEG and HEIC headers only, a few KB). Why: reading HEIC and JPEG dates by hand is fiddly, and a dependency this small earns its place. It hasn't had a release in years, but it is stable and runs only in the browser on the family member's own files.
6. `src/photoDate.ts` (pure, unit-tested):
   - `readPhotoDate(file)`: `exifr.parse(file, ["DateTimeOriginal", "CreateDate"])` inside try/catch; returns a `Date` or `null`. Any failure is `null`, so a photo with no date or an unreadable one never blocks the upload.
   - `earliest(dates)`: the earliest of the non-null dates, or `null`.
   - `toLocalInput(date)` / `fromLocalInput(text)`: convert between a `Date` and a `datetime-local` value in the device's time zone.
7. `RichEditor` gets an `onPhotoDate(publicId, date | null)` callback, called after a successful upload with the date read from the file before it was sent. Reading starts when the file is chosen, in parallel with the upload.
8. `PostSettings` gets the "Use the date from my photos" checkbox (shown when photos are on) and, when it's checked, the **Posted** `datetime-local` field with the "none of these photos has a date" note. When it's checked while posting, it calls `onNotify(false)`.
9. `Feed.tsx` (post form and edit form): keeps `photoDates: Map<publicId, Date | null>` and the checkbox, the field's value, and a "changed by hand" flag. While checked and not changed by hand, the field is the `earliest` of the dates for the photos currently in the content (the content's photo ids are already available). Posting sends `postedAt` (ISO, UTC) only when the box is checked. Editing shows the field with the update's current `createdAt` and sends `postedAt` only when it was changed. Posting resets all of it.

## Tests

Integration, against Postgres (`tests/integration/updates.test.ts` and `photos.test.ts`, following their patterns):
- A family member posts with `postedAt` and the update's `createdAt` is that date; it appears in the feed at that position.
- A supporter's post with `postedAt` is refused (the existing family-member check).
- A future date, a date before 1900, a non-date string, and a number are each refused, and nothing is created.
- `postedAt` with a video is refused.
- Editing with `postedAt` changes `createdAt`; editing a different family's update stays refused.

Unit (fast): `parsePostedAt` boundaries (now, 1900-01-01, one millisecond before each); `earliest`; `toLocalInput`/`fromLocalInput` round trip; `readPhotoDate` returns `null` for a file with no details and for garbage (using a tiny fixture JPEG built in the test, with and without a date).

Prove each access test can fail: copy the file to the scratchpad, remove the date-range check and the member check in turn, watch the matching tests fail, restore.

By hand in the browser (the form is UI): check the box with a dated photo, an undated photo, and a mix; remove the earliest photo; change the date by hand then add a photo; edit the date on an existing update; confirm the email box unchecks and can be rechecked. I'll use a photo with a known date and check the stored Cloudinary copy has none.

## What's cut, and why

- **Existing photos give no dates when editing.** Only photos added in the current session are read. The Posted field is still editable.
- **No "added later" mark and no record of the true posting time.** `createdAt` is simply the chosen date.
- **A backdated update appears mid-feed.** The "new update" button scrolls to the top, so it won't take a reader to it. This joins the existing backlog entry about updates that come into a reader's audience.
- **Date and time, not date only.** `datetime-local` is native and needs no extra logic.
- **No placeholder-photo dates.** Placeholders upload nothing, so there is nothing to read.

## Discoveries

- The lite build of `exifr` has no tag names, so `readPhotoDate` asks for tag numbers and parses the raw text itself (see `claude/lessons.md`). `exifr` loads on the first photo read, as its own 15 KB chunk, so readers never download it.
- The Posted field's "no photo has a date" note also shows when no photo has been added yet.
- Browser check (Chromium, 390px, Cloudinary mocked): the checkbox, the earliest-date rule, removing a photo, a hand-set date surviving new photos, the email box, an undated photo, the empty-date guard, the Video tab, editing a date, and no sideways scroll all behave as specified.
- Adding a second photo replaced the first in that test, on the unmodified editor too, until the cursor was moved below the first photo. Not changed here; it's in `NEXT-SESSION.md`.

## Order of work

Server and its tests, then `photoDate.ts` and its tests, then the form, then the browser check, then the PR.
