# Plan: date a video update from its file

Spec: [spec/updates.md](spec/updates.md#dating-a-video), [spec/MASTER_SPEC.md](spec/MASTER_SPEC.md). Smallest slice; fits one session.

## Server (`server/updates.ts`)
- `createUpdate`: delete the "Only photo updates can be dated" refusal; pass `postedAt` into `createVideoUpdate` and set `createdAt` on the created row. `parsePostedAt` already enforces 1900-to-now.
- No schema change, and no stored date: videos can't be edited.
- `editUpdate` still refuses videos, unchanged.

## Client
- `src/videoDate.ts` (new): `readVideoDate(file: Blob): Promise<Date | null>`. Reads the first and last 1 MB via `file.slice` (never the whole file), walks MP4/MOV boxes to `moov`, then reads `mvhd` creation time (seconds since 1904, UTC; 0 means none). Prefers nothing else, so no Apple-specific keys. Any failure, a zero value, or a date outside 1900 to now is null. Non-MP4 files (webm) give null.
- `src/pages/Feed.tsx` `PostForm`: on the Video tab, once `video` is set and `!video.recorded`, read its date and show the existing `posted` setting labelled "Use the date from my video." Reuse `usePostedDate`: feed it the video's date through the same path as a photo date (a fixed id for the one video), instead of a second hook. `settings()` sends `postedAt` for the video tab too and drops the "A video can't be dated" comment.
- `src/components/postSettings.tsx`: the checkbox label becomes a prop (photos vs video).

## Tests
- Integration (`tests/integration`, real Postgres): a family member posts a video dated in the past and the update's `createdAt` is that date; a date in the future and one before 1900 are refused with 400; a supporter can't post. Prove the date test fails with the `createdAt` line removed.
- Unit (`src/videoDate.test.ts`): a generated MP4 `moov/mvhd` with a known creation time; moov at the end of a file larger than the read window; no moov; zero creation time; out-of-range date; garbage bytes.
- By hand in the preview: upload a video that has a creation date; check the box; confirm the post lands among older updates. Also a recorded video shows no checkbox, and a webm shows "no date found."

## Cut for speed
- No Apple local-time capture key (`com.apple.quicktime.creationdate`); `mvhd` is UTC and shown in the device's zone, which is right to the day in nearly every case.
- No fragmented-MP4 support (`moof` files with no `mvhd` date); they show "no date found."
