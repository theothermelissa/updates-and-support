# Implementation Plan — Photos on updates

Implements "Photos" in `spec/updates.md`, with the matching lines elsewhere: the photo count in notification subjects (`spec/updates.md` → Notifications), the Cloudinary and email-count exceptions in `spec/MASTER_SPEC.md`'s product-wide rules, and the photo paragraph in `spec/access.md` → Stated limits.

The work is two slices, each its own PR. Slice 1 is posting, showing, and deleting; slice 2 is changing photos while editing. Everything is switched off unless `CLOUDINARY_URL` is set, so slice 1 can merge and ship without changing anything for users. Melissa turns photos on after slice 2 has merged (see "Turning photos on"). Slice 1 fills a session on its own; slice 2 may be the next one.

## What Cloudinary's documentation confirms

Checked on 2026-10-15 against cloudinary.com/documentation:

- **Upload signatures** (`authentication_signatures`): take every POST field except `file`, `cloud_name`, `resource_type`, and `api_key`, including `timestamp`; sort by name, join as `name=value` with `&`, append the API secret with no separator, and take the SHA-1 hex digest. The documented example (secret `abcd`, `eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510`) gives `bfd09f95f331f558cbd1320e67aa8d488770583e`; `shasum` reproduces it. A signed timestamp stays valid for one hour. Every field sent must be in the signature, so the browser can't add or change a field.
- **Delivery URL signatures** (`delivery_url_signatures`): the string to sign is everything in the URL after the signature (transformations, then the public ID), with the secret appended; the signature is the first 8 characters of the URL-safe base64 SHA-1 digest, as `/s--XXXXXXXX--/`. The documented example (`c_fill,w_300,h_250/e_grayscale/sample-authenticated.png` + `abcd`) gives `s--iDy_JeBq--`; `openssl` reproduces it.
- **Authenticated assets** (`control_access_to_media`): "the original file and any derived (transformed) versions are protected and only accessible via a signed URL." Signed URLs "don't prevent link sharing." Token-based access and access-control lists are marked premium; the authenticated type and signed URLs are not. The same page also says on-the-fly transformations aren't possible for authenticated assets ("you can only access derived assets that were generated ahead of time during upload or update using eager transformations"), while its own example and the signatures page show a signed, on-the-fly transformed authenticated URL. Step 1 of the hand check settles this on the preview account. If signed on-the-fly transformations fail, the fallback is `c_limit,w_1600/f_jpg/q_auto`, signed as `eager` at upload and used unchanged in the URL: `f_auto` picks a format per request, so it can't be generated ahead of time, while `f_jpg` still converts HEIC.
- **Metadata** (`transformation_reference`): "Cloudinary's default behavior is to strip almost all embedded metadata from a delivered asset when generating new transformations." Only `fl_keep_iptc` and `fl_keep_attribution` keep it; the app never uses either. (`fl_force_strip` concerns incoming transformations at upload, which the app doesn't use.)
- **Upload parameters** (`image_upload_api_reference`): `public_id` may contain `/` and must not include `? & # \ % < > +`; `type` takes `upload`, `private`, or `authenticated`; `allowed_formats` rejects other file types. There's no upload parameter for a maximum file size, so the 10 MB limit is a check in the browser for a friendly message, and Cloudinary enforces its plan's own per-file limit regardless.
- **Destroy** (`image_upload_api_reference`): `POST /image/destroy` with `public_id`, `type`, and `invalidate=true`, which clears CDN copies "between a few seconds and a few minutes." Server-side Upload API calls can use HTTP Basic Auth with the API key and secret instead of a signature.

## Design

**One setting.** `CLOUDINARY_URL` (`cloudinary://<api_key>:<api_secret>@<cloud_name>`, Cloudinary's standard form). `server/cloudinary.ts` parses it into `{ cloudName, apiKey, apiSecret }` or `null` when unset or malformed. When `null`: `/me` reports photos off, the upload endpoint answers 404, a post or edit that includes photos gets a 400, and the feed has no photos.

**Server functions take Cloudinary as an argument.** Like `SendEmails`, a `Cloudinary` value (`{ config, destroy(publicIds) }`) is passed in by the handler, never read from the environment inside `server/`. Integration tests pass a fake with secret `abcd` and a `destroy` that records what it was asked to delete, so tests never reach the network even if Melissa's `.env` has a real key.

**Hand-written, no SDK.** The signing is two short pure functions and the destroy call is one `fetch`, together about 40 lines, each checked against Cloudinary's documented examples. The official `cloudinary` package (2.11, depends on lodash) would add a large surface for three calls, reads `CLOUDINARY_URL` from global state, which blurs "off when unset," and its browser upload widget is a third-party script the product-wide rules don't allow.

**Uploading straight to Cloudinary.** Vercel limits request bodies to 4.5 MB, so photos don't pass through the app. For each chosen photo, the browser asks `POST /api/f/<slug>/photo-upload` for upload fields, then posts the file with them to `https://api.cloudinary.com/v1_1/<cloud>/image/upload`. The server signs a fixed set:
- `public_id`: `families/<familyId>/<22 random URL-safe characters>` (16 random bytes), chosen by the server
- `type`: `authenticated`
- `allowed_formats`: `jpg,png,webp,gif,heic,heif`
- `overwrite`: `false`, so the signed fields, which stay valid for an hour, can't replace a photo's contents after it's posted
- `timestamp`: now

It returns those fields with `cloudName`, `apiKey`, and `signature`. The account has no unsigned upload preset (see "Turning photos on"), so nothing reaches it without a signature from the server.

The browser sends the file as a nameless `Blob`, so Cloudinary never stores filenames like "IMG_scan_results.heic," and reads only `public_id` from Cloudinary's reply. That reply also carries a signed link to the file as uploaded; the browser never stores, sends, or shows it.

**Attaching photos to an update.** A post sends `photos: [publicId, …]`. Before saving, the server checks:
- photos are on, there are at most six, and none repeats
- each ID matches `^families/<this person's familyId>/[A-Za-z0-9_-]{22}$`

Only the server can sign an upload, and it signs only IDs under the signer's own family, so the prefix check is what keeps one family from attaching another's photo. A matching ID that was never uploaded only shows as a broken image to that family. A unique index on `Photo.publicId` refuses attaching one photo to two updates, which would otherwise let deleting one update break the other (409). The server doesn't ask Cloudinary whether the upload finished; a pending-uploads table or an Admin API lookup would add a moving part without protecting anything the prefix doesn't.

**Delivery.** `photoUrl(config, publicId)` always returns
`https://res.cloudinary.com/<cloud>/image/authenticated/s--<sig>--/c_limit,w_1600/f_auto/q_auto/<publicId>`.
The transformation is a constant inside the function, so no code path can produce a URL for the original. `f_auto` serves HEIC as a format the browser can show. URLs carry no version, so they're stable across feed loads.

**Reading.** `listUpdates(db, person, cloudinary)` includes each update's photos in order, filtered by the reader's family prefix on their own (as reactions are filtered by family), and returns `photos: string[]` of signed URLs, or `[]` when photos are off. Each URL contains its public ID, and so the family's ID; that's harmless, because attaching checks the *attacher's* family and nothing else accepts a bare ID. Removed people and other families never reach `listUpdates`: `familyContext` refuses their sessions.

**Deleting.** `deleteUpdate` runs one transaction that locks the update (`SELECT … FROM "Update" WHERE id = $1 AND "familyId" = $2 FOR UPDATE`; no row is a 404 and destroys nothing), reads its photos' public IDs, and deletes it (photos cascade). Only after commit does it call `cloudinary.destroy`, so an edit adding a photo at the same moment either lands first and is destroyed with the rest, or finds the update gone. The destroy calls run in parallel, each with `AbortSignal.timeout(5000)`, so a slow Cloudinary can't hold the request past Vercel's limit. If they fail, it logs the update ID and the number of photos (not the IDs) and still succeeds, so the photo leaves the app at once; the leftover is reachable only through links saved earlier (spec: Stated limits). Clearing up leftovers is in `NEXT-SESSION.md`. If photos have since been turned off, the rows still go and the log says so.

**Notifications.** `notifySupporters` takes the photo count, and `notificationEmail`'s subject adds " (1 photo)" or " (N photos)" when it's above zero.

## Slice 1 — Posting, showing, and deleting (one PR)

1. **Migration `photos`** (additive): `model Photo { id, updateId, publicId @unique, position Int, createdAt }`, relation to `Update` with `onDelete: Cascade`, `@@index([updateId, position])`. Written by hand if `prisma migrate dev` won't run (`claude/lessons.md`).
2. **`server/cloudinary.ts`**, pure except `destroy`:
   - `parseCloudinaryUrl(url)` and `cloudinaryFromEnv()` (returns `Cloudinary | null`, used only by handlers)
   - `signParams(params, secret)`: sorted `name=value` joined by `&`, secret appended, SHA-1 hex
   - `signPath(path, secret)`: first 8 characters of the URL-safe base64 SHA-1 of path + secret
   - `photoUrl(config, publicId)`, as in Design
   - `destroyPhotos(config, publicIds)`: one `POST /image/destroy` per ID, in parallel, with Basic Auth, `type=authenticated`, `invalidate=true`, and a 5-second timeout; `"ok"` and `"not found"` both count as done, anything else throws
3. **`server/photos.ts`**:
   - `uploadFields(person, cloudinary, now)`: `requireFamilyMember`, then the signed fields above
   - `validPhotoIds(input, person, cloudinary)`: the checks in "Attaching," 400 on failure; an empty or missing list is fine with photos off
4. **`server/updates.ts`**:
   - `createUpdate(db, person, body, notifyWith?, photos?: { ids: unknown; cloudinary: Cloudinary | null })` validates, then creates the update and its `Photo` rows in one nested write, mapping `P2002` on `publicId` to 409. Passes the count to `notifySupporters`.
   - `listUpdates(db, person, cloudinary)` adds `photos`.
   - `deleteUpdate(db, person, id, cloudinary)` as in Design.
5. **`server/notifications.ts` and `server/email.ts`**: the photo count in the subject.
6. **Handlers**:
   - `api/f/[slug]/photo-upload.ts` (POST): `familyContext`, 401 without a session, 404 when photos are off, then `uploadFields` (403 for a supporter).
   - `api/f/[slug]/updates/index.ts` and `[id].ts` pass `cloudinaryFromEnv()` and `body.photos`.
   - `api/f/[slug]/me.ts` adds `family.photos: boolean`.
7. **`src/pages/Feed.tsx`**:
   - **Post form.** When `photos` is on, an "Add photos" file input (`accept="image/*" multiple`). Each chosen file over 10 MB is refused with a message; each other file gets fields from `photo-upload` and is posted to Cloudinary with `FormData`, as a nameless `Blob`, showing a local preview (`URL.createObjectURL`), an "Uploading…" state, and "Remove." Choosing past six refuses the extras with a message. "Post" is disabled while any upload is in flight, and a failed upload shows a message and drops that photo. Posting sends the uploaded IDs in order.
   - **Feed.** Under the body, each URL as `<img src alt="Photo N of M" loading="lazy">` at full width (`width: 100%; height: auto`).
   - `src/api.ts`: `Me.family.photos`.
8. **Config and docs**: `CLOUDINARY_URL=""` with a comment in `.env.example`; a row in README's Vercel variables table ("Optional. Turns on photos. Production: the production Cloudinary account. Preview: a separate preview account."); "Turning photos on" in README → Deployment, from the section below.
9. **`NEXT-SESSION.md`**: clear up Cloudinary leftovers (photos uploaded but never posted, failed deletions, photos whose update was deleted while photos were off, and files posted with signed fields to Cloudinary's `raw` or `video` endpoints), comparing the account's assets with `Photo` rows.

## Slice 2 — Changing photos while editing (one PR)

1. `editUpdate(db, person, id, body, photos?)` takes the full list the update should have. IDs already on this update are kept (and reordered as given); new IDs pass the same checks as a post; at most six in all. In one transaction it locks the update as `deleteUpdate` does, reads its current photos inside the lock, updates the body, deletes the update's `Photo` rows, and recreates them with `createMany` (never an upsert, which would quietly move a photo from another update instead of refusing with 409). After commit, it destroys the IDs that were on the update and are no longer listed, logging failures as `deleteUpdate` does. Omitting `photos` leaves them unchanged, so a body-only edit still works with photos off.
2. **Edit form**: the update's current photos (from the feed's URLs) with "Remove," plus "Add photos," using the post form's upload code. For that, the feed's `photos` becomes `{ id, url }[]`; the ID is already inside each URL, so this shows readers nothing new.
3. Tests listed under Slice 2 below.

## Tests

Integration tests use real Postgres and the fake `Cloudinary` (secret `abcd`, recording `destroy`). Handler tests set and restore `CLOUDINARY_URL` and `DATABASE_URL` for their file, as the reactions endpoint test does. Each access test is shown to fail with its rule removed, per `claude/lessons.md`.

**Slice 1, `tests/integration/photos.test.ts`** (Rivera: Ana, supporter Sam; Okafor: Chidi, supporter Olu):
- **Upload fields.** Ana gets fields signed over exactly `allowed_formats`, `overwrite=false`, `public_id`, `timestamp`, and `type=authenticated`, with a `families/<Rivera id>/` ID; two requests get different IDs. Through the handler: no session gets 401, Olu's token under Rivera's cookie name gets 401, Sam gets 403, and with `CLOUDINARY_URL` unset Ana gets 404.
- **Attaching.** Each of these gets 400 and stores no update and no photo: an Okafor-prefixed ID, an ID with both prefixes (`families/<Okafor id>/families/<Rivera id>/…`, which catches a check that isn't anchored at both ends), a malformed ID, a repeated ID, seven IDs, and any photos while photos are off. An ID already on another update gets 409. Six valid IDs store six rows in the given order.
- **Reading.** Sam's feed has Rivera's photo URLs, in order, each matching the full `photoUrl` pattern (authenticated, signed, with `c_limit,w_1600/f_auto/q_auto/`); Olu's serialized feed contains no Rivera public ID or URL; a cross-family `Photo` row inserted directly doesn't appear in Ana's feed; with photos off, the feed's `photos` is `[]`.
- **Removed reader.** Through the updates handler, a removed Sam's cookie gets 401 and no URLs.
- **Deleting.** Deleting an update calls `destroy` with exactly its public IDs and removes its rows; another family's update is a 404, calls nothing, and keeps its rows; a failing `destroy` still deletes the update and its rows.
- **Notifications.** A post with two photos sends subjects ending " (2 photos)"; one with one photo, " (1 photo)"; none, no suffix.

**Slice 1, unit tests** in `server/cloudinary.test.ts`:
- `signParams` gives `bfd09f95f331f558cbd1320e67aa8d488770583e` for Cloudinary's documented example.
- `signPath` gives `iDy_JeBq` for Cloudinary's documented delivery example.
- `photoUrl` always contains the fixed transformation and never `fl_keep`, and its signature is `signPath` of everything after it.
- `parseCloudinaryUrl` reads a valid URL and returns `null` for an empty or malformed one.
- `destroyPhotos`, with `fetch` stubbed, sends Basic Auth, `type=authenticated`, and `invalidate=true`, and throws on an unexpected result.

**Slice 2**, added to `photos.test.ts`: an edit can drop and add photos (dropped ones passed to `destroy`, rows replaced in order); it can't add another family's ID or go past six (400, nothing changed, nothing destroyed); it can't claim a photo from another update in the family (409, and the photo stays on its update); a supporter's edit is refused as today; a body-only edit leaves photos alone. An edit adding a photo while the update is being deleted either is refused or has its photo destroyed with the rest, made deterministic with a held row lock as the gate-lock tests do (`claude/lessons.md`).

**Hand check**, on a preview with the preview Cloudinary account (see "Turning photos on"):
1. Post an update with two photos, one an iPhone HEIC; both show in the feed for the family member and a supporter. If they don't load, switch to the `f_jpg` eager fallback (see "What Cloudinary's documentation confirms").
2. Open a photo's URL with the `s--…--/` part removed, and with the transformation changed: both are refused.
3. Download delivered copies of photos taken with location on, a HEIC, a PNG, and one narrower than 1600 pixels (where the resize changes nothing), and confirm none has GPS data (`exiftool` or Preview → Inspector).
4. Delete the update; within a few minutes, its saved photo URL stops working.
5. A notification email for the photo post says "(2 photos)."
6. With `CLOUDINARY_URL` unset (production before turning on), no photo controls appear.

## Turning photos on

Use two free Cloudinary accounts: one for production and one for previews and local work. Previews run unmerged code, so they must never hold the key that can sign links to, or delete, real families' photos, just as they never touch the production database.

1. Create both accounts. In each, open Settings → Upload and delete any **unsigned** upload preset the account came with; uploads are signed by the server, and the cloud name is visible in every photo link.
2. In each account, copy the API environment variable from Settings → API Keys (`cloudinary://…`). It contains the secret: don't paste it into chat. Set the production account's with `npx vercel env add CLOUDINARY_URL production` and the preview account's with `npx vercel env add CLOUDINARY_URL preview`, pasting from the clipboard at the prompt. Put the preview account's in the local `.env`.
3. Redeploy a preview and run the hand check. Then redeploy production (`npx vercel redeploy <production url> --scope theothermelissa-s-team`) or merge any PR.

Turning photos off again is unsetting the variable and redeploying; stored photos stay in Cloudinary and reappear when it's set again. An update deleted while photos are off leaves its photos in Cloudinary with nothing in the app pointing to them, so only the leftovers clean-up can find them.

## Cut for speed

- **No captions, reordering, video, or photos from supporters** (also the spec).
- **No photos in emails**; only the count in the subject.
- **No clean-up of leftover Cloudinary photos** (uploaded but never posted, failed deletions, deleted while photos were off, or posted to the `raw` or `video` endpoints). They're private and reachable only by links saved earlier; `NEXT-SESSION.md`.
- **No check that an upload finished** before attaching; a missing one is a broken image in that family's own feed.
- **No limit on how many uploads a family member can request**, beyond Cloudinary's monthly credits.
- **No lightbox, grid, or thumbnails** in the feed; photos are full width.
- **No retry of a failed upload**; remove and choose it again.

## Progress and discoveries

Not started.
