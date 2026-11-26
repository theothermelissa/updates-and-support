# Implementation plan: keep each photo's taken date

Spec: [updates.md → Dating an update from its photos](spec/updates.md#dating-an-update-from-its-photos), [MASTER_SPEC.md](spec/MASTER_SPEC.md).

## Problem
"Use the date from my photos" finds nothing when editing, because a photo's date is read on the device when it's added and then discarded. Photos already in an update have no date anywhere.

## Design
Store the date with the photo, validated by the server, and send it back only to family members.

1. **Schema.** `Photo.takenAt DateTime?`. Hand-written migration `prisma/migrations/20261126000000_photo_taken_at/migration.sql` (`ALTER TABLE "Photo" ADD COLUMN "takenAt" TIMESTAMP(3);`). Check `origin/main` has no later-timestamped migration first.
2. **Input.** `UpdateInput.photoDates?: unknown`, a map of public ID to ISO string. New `parsePhotoDates(value, now)` in `server/postedAt.ts`: a non-object is ignored; each entry is kept only if the value is a string within 1900..now (same bounds as `parsePostedAt`); anything else is silently dropped so a camera with a wrong clock never blocks a post.
3. **Write.** In `createUpdate` and `editUpdate`, set `takenAt` only on photo rows being created (`added` ids in edit), from the parsed map. A kept photo's date is never rewritten by a later edit. Video updates ignore it.
4. **Read.** `listUpdates` selects `takenAt`; for family members only, `FeedUpdate.photoDates: Record<publicId, ISO>` (photos with a date). Supporters' responses carry no such field.
5. **Client.** `usePostedDate(content, initial, known)` seeds its `dates` map from `update.photoDates` when editing. Add `photoDates()` returning the dates (as ISO) of photos in `content` that have one. `Feed.tsx` sends `photoDates` with post and edit bodies when non-empty. `startEditing` passes the update's dates.
6. **Copy.** Edit-mode "no photo has a date" note stays accurate as is.

## Tests
- Integration (real Postgres, `tests/integration`): a family member's post with `photoDates` stores `takenAt`; the list returns `photoDates` to a family member and **no `photoDates` key to a supporter** (prove it fails with the guard removed); edit stores dates only for added photos and leaves a kept photo's date unchanged; out-of-range and malformed entries are dropped, not refused.
- Unit: `parsePhotoDates` bounds and shapes; `usePostedDate` isn't unit-tested (glue); verify by hand in the preview.

## Cutting for speed
- No backfill: photos posted before this change have no date. Nobody can recover it, since Cloudinary stripped it.
- No UI to set a single photo's date by hand.
