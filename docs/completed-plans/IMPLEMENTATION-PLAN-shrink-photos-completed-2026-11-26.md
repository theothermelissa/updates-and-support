# Implementation plan: shrink photos on the device

Bridges the "Photos" section of `spec/updates.md` and the current code. Cloudinary's free plan rejects images over 10 MB (and about 25 megapixels), so the browser shrinks each photo before the direct upload.

## Approach

Add `preparePhoto(file)` to `src/photos.ts`, called by `addPhoto` in `src/editor/RichEditor.tsx` in place of `photoSizeMessage`. It resolves to the blob to upload, or a message to show.

1. A GIF is returned as it is (a canvas would flatten the animation), still subject to the 10 MB limit.
2. Otherwise decode with `createImageBitmap(file)` (applies EXIF orientation). If it is 1600 px wide or less and 10 MB or less, return the original (`needsShrink`). Else draw onto a canvas at 1600 wide and export JPEG at quality 0.9 with `canvas.toBlob`.
3. If decoding or encoding fails (HEIC in desktop Chrome or Firefox, or out of memory): return the original when `size <= 10 MB`; otherwise return the message "This photo is too large for this browser. Try Safari, or choose a JPEG copy."
4. `readPhotoDate` keeps reading the original `File`, as today, before upload.

The decision in steps 1 and 3 is a small pure function, `choosePhoto({ isGif, size, shrunk })`, so it can be unit-tested without a canvas.

`photoSizeMessage` is replaced by the new message. The upload ticket, signing, and server are unchanged.

## Steps

- [x] `choosePhoto` and `preparePhoto` in `src/photos.ts`; remove `photoSizeMessage`.
- [x] Use `preparePhoto` in `addPhoto`; the card's local preview stays the original file's object URL.
- [x] Unit tests for `choosePhoto`.
- [x] README: nothing to change (no new setting).

## Tests

- Unit (`src/photos.test.ts`): `choosePhoto` returns the shrunk photo when there is one; the original GIF when it's 10 MB or less; the original when shrinking failed and it's 10 MB or less; the "too large for this browser" message when shrinking failed and it's over 10 MB; the message for a GIF over 10 MB. Each is shown to fail with its branch removed.
- No access or privacy rule changes, so no integration tests.
- By hand in the PR preview, on an iPhone in Chrome: add a photo over 10 MB, check it uploads, is upright, and still dates the update from the photo ("Use the date from my photos"). On desktop Chrome: add a HEIC under and over 10 MB.

## Cut for speed

- No server-side conversion for large HEIC in browsers that can't decode it (needs a paid Cloudinary plan).
- No upload progress bar; the card keeps showing "Uploading…".
