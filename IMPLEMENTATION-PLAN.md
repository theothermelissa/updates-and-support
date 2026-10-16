# Implementation Plan — Updates made of blocks, with photos

Implements `spec/updates.md` → "An update," "The feed," "Writing an update," "Editing," "Deleting," and "Photos," plus the photo count in notification subjects, the Cloudinary and email-count exceptions in `spec/MASTER_SPEC.md`'s product-wide rules, and the photo paragraph in `spec/access.md` → Stated limits.

Three slices, each its own PR and sized for one session. Each one merges and ships safely on its own.

1. **Text blocks.** An update's content becomes an ordered list of blocks, text only for now. Readers see no change; the editor becomes a column of text boxes.
2. **Photo blocks with placeholders.** Photo blocks, captions, the photo count in emails, and grey placeholder photos on test sites. Production still has no photo controls, so Melissa can try the whole experience on a preview without a Cloudinary key.
3. **Real photos with Cloudinary.** Signed uploads, signed links, deleting from Cloudinary, and the loading box. Photos stay off in production until Melissa sets the key (see "Turning photos on").

## What Cloudinary's documentation confirms

Checked on 2026-10-15 against cloudinary.com/documentation:

- **Upload signatures** (`authentication_signatures`): take every POST field except `file`, `cloud_name`, `resource_type`, and `api_key`, including `timestamp`; sort by name, join as `name=value` with `&`, append the API secret with no separator, and take the SHA-1 hex digest. The documented example (secret `abcd`, `eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510`) gives `bfd09f95f331f558cbd1320e67aa8d488770583e`; `shasum` reproduces it. A signed timestamp stays valid for one hour. Every field sent must be in the signature, so the browser can't add or change a field.
- **Delivery URL signatures** (`delivery_url_signatures`): the string to sign is everything in the URL after the signature (transformations, then the public ID), with the secret appended; the signature is the first 8 characters of the URL-safe base64 SHA-1 digest, as `/s--XXXXXXXX--/`. The documented example (`c_fill,w_300,h_250/e_grayscale/sample-authenticated.png` + `abcd`) gives `s--iDy_JeBq--`; `openssl` reproduces it.
- **Authenticated assets** (`control_access_to_media`): "the original file and any derived (transformed) versions are protected and only accessible via a signed URL." Signed URLs "don't prevent link sharing." Token-based access and access-control lists are marked premium; the authenticated type and signed URLs are not. The same page also says derived versions of authenticated assets must be generated ahead of time with `eager`, while its own example and the signatures page show a signed, on-the-fly transformed authenticated URL. The hand check settles this on the preview account. If on-the-fly fails, the fallback is `f_jpg/q_auto`, signed as `eager` at upload and used unchanged in the URL; `f_auto` can't be generated ahead of time, and `f_jpg` still converts HEIC.
- **Incoming transformations** (`transformations_on_upload`): "Contrary to eager transformations, incoming transformations are applied before storing the asset in Cloudinary," set with the upload's `transformation` parameter, for example "to limit the resolution size." Never `f_auto` in one. **`fl_force_strip`** (`transformation_reference`): "Instructs Cloudinary to clear all embedded metadata while applying an incoming transformation. Incoming transformations keep the metadata of the original file by default, so this flag is needed to strip it"; for images it clears IPTC, Exif, and XMP except one tag, DigitalSourceType. So `transformation=c_limit,w_1600,fl_force_strip` stores a shrunk copy without location, and nothing else is kept.
- **Delivered metadata** (`transformation_reference`): delivered transformations strip "almost all embedded metadata" unless `fl_keep_iptc` or `fl_keep_attribution` is used; the app never uses either.
- **Upload parameters** (`image_upload_api_reference`): `public_id` may contain `/` and must not include `? & # \ % < > +`; `type` takes `upload`, `private`, or `authenticated`; `allowed_formats` rejects other file types; `overwrite` defaults to true for signed uploads. There's no parameter for a maximum file size, so the 10 MB limit is a browser check, and Cloudinary enforces its plan's own per-file limit regardless.
- **Destroy** (`image_upload_api_reference`): `POST /image/destroy` with `public_id`, `type`, and `invalidate=true`, which clears CDN copies "between a few seconds and a few minutes." Server-side Upload API calls can use HTTP Basic Auth with the API key and secret instead of a signature.

## Design

### Blocks

**Storage.** A `Block` table: `id`, `updateId` (cascade on delete), `position`, `kind` (enum `text` | `photo`), `text`, and, from slice 2, `caption` and `publicId` (unique, null for a placeholder). Unique on `(updateId, position)`. Rows rather than a JSON column, so the unique index on `publicId` keeps one photo on one update, deleting an update cascades, and the photos to delete from Cloudinary are one query.

**Validation** is one pure function, `validBlocks(input, settings, familyId)` in `server/blocks.ts`, which returns clean blocks or throws a 400. It accepts only:
- an array of 1 to 20 objects
- `{ type: "text", text }`, with `text` a string that isn't empty after trimming; at most 20,000 characters of text in all (today's body limit)
- `{ type: "photo", caption?, placeholder: true }` or `{ type: "photo", caption?, publicId }` (from slices 2 and 3); `caption` is a string or null, trimmed, at most 300 characters, empty stored as null
- at most six photo blocks, no repeated `publicId`
- no other keys and no other types

"Both" and "neither" of `placeholder` and `publicId` are judged by which keys are present, not by truthiness, so `{ placeholder: false, publicId }` and `{ publicId: null }` are refused too.

Photo blocks are checked against the settings: a placeholder needs placeholders on, and a `publicId` new to the update needs Cloudinary on and must start with `families/<this person's familyId>/` followed by exactly `[A-Za-z0-9_-]{22}` to the end. A `publicId` already on the update being edited is accepted whatever the settings, so turning photos off, or rolling back a slice, never stops a family from editing the text of an update that has photos. The database adds the last rule: a `publicId` on another update fails the unique index (409), so a photo is on one update at a time. A photo removed from one update could be put on another in the same family before its deletion runs; that never crosses families.

**Input.** If the request has `blocks`, only `blocks` is used; otherwise `body`, if it's a string, becomes one text block. They're never both validated.

**Writing.** `createUpdate` creates the update and its blocks in one nested write (`blocks: { create: [...] }`), so an update never exists without blocks. Editing runs in one interactive transaction that locks the update (`SELECT … FROM "Update" WHERE id = $1 AND "familyId" = $2 FOR UPDATE`; no row is a 404), deletes its blocks, recreates them with `createMany`, and sets `body` and `editedAt`. A `P2002` aborts the transaction, so it's caught outside `$transaction` and becomes a 409. Without the lock, two edits at the same moment could each delete the other's old rows and leave both sets. Never an upsert, which would quietly move a photo from another update instead of refusing it.

**Reading.** `listUpdates` returns each update's `blocks` in order: `{ type: "text", text }` or `{ type: "photo", caption, publicId, url }`, with `url` a signed link, or null for a placeholder or when Cloudinary is off. The client draws a null `url` as the grey 4:3 box. The editor sends a kept photo back by its `publicId` (already visible inside its URL) and a kept placeholder as a new placeholder.

**Changing over from `body`.** Vercel runs migrations before the new code goes live, so the code already in production keeps running against the migrated database for a minute or two, and must keep working. Simplest safe approach:
- The migration adds `Block` and copies each update's `body` into one text block. It keeps `body`.
- The new code still writes `body`, as its text blocks joined by blank lines (`""` for photos only), so the previous version still works if it's ever redeployed.
- The new code reads blocks; an update with none (posted by the old code during that minute) shows its `body` as one text block.
- The API still accepts `{ body }` as one text block, so a family member whose page loaded before the deploy can still post and edit.
- An edit saved by the old code during that minute changes `body` but not the block, so slice 1 would show the earlier text, which matters if the edit took something sensitive out. Slice 2's migration closes this: by then only slice-1 code is running, which keeps `body` equal to its joined text blocks, so it adds a text block from `body` for any update with no blocks, and rewrites the text of any update whose only block is a text block that differs from `body`. Slice 2 then drops the read fallback.
- Dropping the `body` column and `{ body }` input goes in `NEXT-SESSION.md`.

### Photo settings

`photoSettingsFromEnv()` in `server/photoSettings.ts`, used only by handlers, returns `{ cloudinary: Cloudinary | null, placeholders: boolean }`:
- `placeholders` is true only when `PHOTO_PLACEHOLDERS === "1"` **and** `VERCEL_ENV !== "production"`. It's set only in Vercel's Preview variables and the local `.env`, and production ignores it even if it's set there by mistake.
- `cloudinary` comes from `CLOUDINARY_URL` (slice 3), or null.
- Server functions take the settings as an argument, never reading the environment, so tests can't reach the network even if Melissa's `.env` has a key.

`/me` reports `family.photos` as `"real"` when Cloudinary is on (real uploads win), `"placeholder"` when only placeholders are on, and `"off"` otherwise; the editor shows "Add photo" unless it's `"off"`. Placeholders saved earlier stay grey boxes once real photos are on, and stay accepted on edit only while placeholders are on.

### Real photos (slice 3)

**Hand-written, no SDK.** The signing is two short pure functions and the destroy call is one `fetch`, together about 40 lines, each checked against Cloudinary's documented examples. The official `cloudinary` package (2.11, depends on lodash) would add a large surface for three calls and reads `CLOUDINARY_URL` from global state, which blurs "off when unset," and its browser upload widget is a third-party script the product-wide rules don't allow.

**Uploading straight to Cloudinary.** Vercel limits request bodies to 4.5 MB, so photos don't pass through the app. For each chosen photo, the browser asks `POST /api/f/<slug>/photo-upload` for upload fields, then posts the file with them to `https://api.cloudinary.com/v1_1/<cloud>/image/upload`. The server signs a fixed set:
- `public_id`: `families/<familyId>/<22 random URL-safe characters>` (16 random bytes)
- `type`: `authenticated`
- `transformation`: `c_limit,w_1600,fl_force_strip`, so the stored copy is shrunk and has no embedded details
- `allowed_formats`: `jpg,png,webp,gif,heic,heif`
- `overwrite`: `false`, so the signed fields, valid for an hour, can't replace a photo after it's posted
- `timestamp`: now

It returns those with `cloudName`, `apiKey`, and `signature`. The accounts have no unsigned upload preset (see "Turning photos on"). The browser sends the file as a nameless `Blob`, so Cloudinary never stores filenames like "IMG_scan_results.heic," and reads only `public_id` from Cloudinary's reply, never its `secure_url`.

**Delivery.** `photoUrl(config, publicId)` always returns
`https://res.cloudinary.com/<cloud>/image/authenticated/s--<sig>--/c_limit,w_1600/f_auto/q_auto/<publicId>`.
The transformation is a constant inside the function, so no code path can produce a URL without it. `f_auto` serves HEIC as a format the browser can show. Each URL contains its public ID, and so the family's ID; that's harmless, because attaching checks the *attacher's* family and nothing else accepts a bare ID.

**Deleting from Cloudinary.** `deleteUpdate` locks the update as editing does, reads its blocks' public IDs, and deletes it (blocks cascade). `editUpdate` reads the public IDs inside its lock and works out which ones the new blocks drop. Only after commit does either call `cloudinary.destroy`, in parallel, each call with `AbortSignal.timeout(5000)`. If they fail, the request still succeeds, so the photo leaves the app at once, and the server logs the update ID and the number of photos, not the IDs. The leftover can only be reached through links saved earlier (spec: Stated limits).

## Slice 1 — Text blocks

1. **Migration `blocks`**, written by hand if `prisma migrate dev` won't run (`claude/lessons.md`): `enum BlockKind { text photo }`, `model Block` (without `caption` and `publicId`; `text` nullable, since photo blocks will have none), and `INSERT INTO "Block" ("id", "updateId", "position", "kind", "text") SELECT gen_random_uuid()::text, "id", 0, 'text'::"BlockKind", "body" FROM "Update"` (`gen_random_uuid()` already backs `Person.unsubscribeToken`).
2. **`server/blocks.ts`**: `validBlocks` for text blocks; any photo block is a 400 until slice 2. `bodyOf(blocks)` joins text blocks for the `body` column.
3. **`server/updates.ts`**: `createUpdate(db, person, input, notifyWith?)` and `editUpdate(db, person, id, input)` take `{ blocks }` or `{ body }`; editing locks and replaces. `listUpdates` returns `blocks`, with the `body` fallback.
4. **Handlers** pass the request body's `blocks` and `body` through.
5. **`src/pages/Feed.tsx`**: a `BlockEditor` shared by posting and editing: a column of text boxes, each with "Remove" (hidden when it's the only block), and "Add text" at the bottom; empty boxes are dropped before sending. The feed draws text blocks as today's paragraphs, with links.
6. **`NEXT-SESSION.md`**: drop the `body` column and `{ body }` input once slice 2 has been live for a while.

**Tests.**
- Unit, `server/blocks.test.ts`: accepts one or several text blocks and trims them; refuses a non-array, zero or 21 blocks, `null` or an array as a block, an empty or whitespace text block, more than 20,000 characters in one block and spread across several, an unknown `type`, an extra key, a non-string `text`, and any photo block. With both `blocks` and `body`, only `blocks` is used.
- Integration, `tests/integration/updates.test.ts`: the existing cross-family, supporter, and edit/delete tests, rewritten for blocks, still pass and are each shown failing with their rule removed. Added:
  - blocks come back in order
  - editing replaces all blocks and keeps `body` in step
  - an update with no blocks shows its `body`
  - `{ body }` still posts
  - another family's edit is a 404 that leaves its blocks unchanged
- Migration, by hand: on a scratch database at `main`'s migrations, insert updates (multi-line, with links, with `'` and a backslash), apply `blocks`, and confirm each has one text block equal to its `body`; record the result in "Progress and discoveries." After the preview builds, the test family's earlier updates look unchanged.

## Slice 2 — Photo blocks with placeholders

1. **Migration `photo_blocks`**: `caption TEXT` and `publicId TEXT UNIQUE` on `Block` (additive), then the reconciliation described under "Changing over from `body`." Remove the read fallback from `listUpdates`. Check the reconciliation by hand on a scratch database at slice 1's migrations, with one update that has no blocks and one whose text block differs from its `body`.
2. **`server/photoSettings.ts`**: `photoSettingsFromEnv()` with `placeholders` only (`cloudinary` is always null until slice 3).
3. **`server/blocks.ts`**: photo blocks, captions, and the six-photo limit. A `publicId` block is a 400 until slice 3, since Cloudinary is never on.
4. **`server/updates.ts`**: create, edit, and list handle photo blocks; `createUpdate` passes the photo-block count to `notifySupporters`.
5. **`server/notifications.ts` and `server/email.ts`**: the subject adds " (1 photo)" or " (N photos)" when the count is above zero. The body is unchanged.
6. **`api/f/[slug]/me.ts`**: `family.photos`.
7. **`src/pages/Feed.tsx`**: "Add photo" (unless photos are `"off"`) opens the file picker; with placeholders, choosing a photo adds a grey card with a caption field and "Remove," uploading nothing. If placeholders are later turned off on a test site, saving an update that still has one shows the server's message, which names the placeholder as the reason. The feed draws a photo block as a grey 4:3 box (`aspect-ratio: 4 / 3; background: #ddd`) with the caption beneath, as plain text without links.
8. **Config and docs**: `PHOTO_PLACEHOLDERS=""` with a comment in `.env.example`; a README row ("Preview only, `1`. Never in Production; production ignores it."). Melissa sets it in Vercel's Preview variables.

**Tests.**
- Unit, `server/blocks.test.ts`: a placeholder block with and without a caption; caption trimmed, empty becomes null, 301 characters refused, non-string refused; seven photo blocks refused; `placeholder` other than `true` refused; a placeholder with placeholders off refused; a photo block with neither key, with both keys, with `{ placeholder: false, publicId }`, and with `publicId: null` refused; any new `publicId` refused while Cloudinary is off.
- Unit, `server/photoSettings.test.ts`: placeholders on only for exactly `PHOTO_PLACEHOLDERS=1`; off with `VERCEL_ENV=production` even when the flag is `1`; off when unset, `0`, or `true`. Tests that touch settings clear `PHOTO_PLACEHOLDERS`, `VERCEL_ENV`, and `CLOUDINARY_URL` first, so Melissa's `.env` can't change their results.
- Integration, `tests/integration/photos.test.ts` (Rivera: Ana, supporter Sam; Okafor: Chidi, supporter Olu):
  - with placeholders on, Ana posts text, placeholder, text; Sam's feed has them in order with the caption and `url: null`
  - Olu's serialized feed contains no Rivera caption or text
  - with placeholders off, a placeholder block is a 400 and stores nothing
  - a post with two placeholders sends subjects ending " (2 photos)"; one, " (1 photo)"; none, no suffix; the body has no caption or text
  - deleting the update removes its blocks
- Hand check on the preview with `PHOTO_PLACEHOLDERS=1`: post text, photo, and text with captions; edit to add, caption, and remove blocks; a photo-only update; the email subject; delete. Production shows no "Add photo."

## Slice 3 — Real photos with Cloudinary

1. **`server/cloudinary.ts`**, pure except `destroyPhotos`:
   - `parseCloudinaryUrl(url)`: `{ cloudName, apiKey, apiSecret }` or null for empty or malformed
   - `signParams(params, secret)` and `signPath(path, secret)`, as documented
   - `photoUrl(config, publicId)`, as in Design
   - `destroyPhotos(config, publicIds)`: one `POST /image/destroy` per ID, in parallel, with Basic Auth, `type=authenticated`, `invalidate=true`, and a 5-second timeout; `"ok"` and `"not found"` count as done, anything else throws
2. **`server/photoSettings.ts`**: `cloudinary` from `CLOUDINARY_URL`.
3. **`server/photos.ts`**: `uploadFields(person, settings, now)`: `requireFamilyMember`, 404 when Cloudinary is off, then the signed fields.
4. **`server/blocks.ts`**: `publicId` blocks, with the family-prefix check.
5. **`server/updates.ts`**: signed `url`s in `listUpdates`; `deleteUpdate` locks and destroys after commit; `editUpdate` destroys dropped public IDs after commit; `P2002` on `publicId` becomes a 409.
6. **`api/f/[slug]/photo-upload.ts`** (POST): `familyContext`, 401 without a session, then `uploadFields`.
7. **`src/pages/Feed.tsx`**: with photos `"real"`, choosing a photo shows a local preview (`URL.createObjectURL`) with "Uploading…", gets fields, and posts the file as a nameless `Blob`; a file over 10 MB is refused with a message, a failed upload removes the card with a message, and saving waits for uploads. In the feed, each photo is an `<img alt="Photo N of M" loading="lazy">` at full width inside a grey 4:3 box that gives way to the photo's own shape once it loads.
8. **Config and docs**: `CLOUDINARY_URL=""` in `.env.example`; README rows and "Turning photos on" from below.
9. **`NEXT-SESSION.md`**: clear up Cloudinary leftovers (uploaded but never saved, failed deletions, deleted while photos were off, or posted to the `raw` or `video` endpoints with signed fields), comparing each account's assets with `Block.publicId`.

**Tests.** Integration tests use a fake `Cloudinary` (secret `abcd`, `destroy` recording what it's asked to delete). Handler tests set and restore `CLOUDINARY_URL`, `PHOTO_PLACEHOLDERS`, and `DATABASE_URL` for their file, as the reactions endpoint test does. Each access test is shown failing with its rule removed.
- **Upload fields.** Ana gets fields signed over exactly `allowed_formats`, `overwrite=false`, `public_id`, `timestamp`, `transformation=c_limit,w_1600,fl_force_strip`, and `type=authenticated`, with a `families/<Rivera id>/` ID; two requests get different IDs. Through the handler: no session is 401, Olu's token under Rivera's cookie name is 401, Sam is 403, and with `CLOUDINARY_URL` unset Ana gets 404.
- **Attaching.** Each is a 400 that stores nothing: an Okafor-prefixed ID; an ID with both prefixes (`families/<Okafor id>/families/<Rivera id>/…`); a malformed ID; a repeated ID; a `publicId` block while Cloudinary is off. An ID already on another update is a 409, on post and on edit, and the photo stays where it was.
- **Placeholders stay behind their flag.** With Cloudinary on and placeholders off, a placeholder block is a 400; through the handler with `CLOUDINARY_URL` set and `PHOTO_PLACEHOLDERS` unset, the same.
- **Reading.** Sam's feed has signed URLs matching the full `photoUrl` pattern; Olu's serialized feed contains no Rivera public ID, URL, or caption; a cross-family `Block` row inserted directly under a Rivera update with an Okafor-prefixed ID isn't given a URL. Through the updates handler, a removed Sam gets 401.
- **Deleting.** Deleting an update calls `destroy` with exactly its public IDs (not placeholders) and removes its blocks; another family's update is a 404 that destroys nothing and keeps its blocks; a failing `destroy` still deletes the update.
- **Editing.** Dropping a photo block destroys its ID after the edit commits; keeping one doesn't; a failed edit (400 or 409) destroys nothing. With Cloudinary off, editing the text of an update with a photo keeps the photo and destroys nothing; adding a new `publicId` is still refused. An edit adding a photo while the update is being deleted is either refused or has its photo destroyed with the rest, made deterministic with a held row lock as the gate-lock tests do.
- **Unit, `server/cloudinary.test.ts`**: `signParams` gives `bfd09f95f331f558cbd1320e67aa8d488770583e` and `signPath` gives `iDy_JeBq` for the documented examples; `photoUrl` always contains the fixed transformation, never `fl_keep`, and its signature is `signPath` of everything after it; `parseCloudinaryUrl` handles valid, empty, and malformed values; `destroyPhotos`, with `fetch` stubbed, sends Basic Auth, `type=authenticated`, and `invalidate=true`, and throws on an unexpected result.

**Hand check**, on a preview with the preview account:
1. Post text, photo, and text, with an iPhone HEIC in portrait; it shows upright for the family member and a supporter, with a grey box while loading. If photos don't load, switch to the eager fallback.
2. A photo's URL with `s--…--/` removed, or with the transformation changed, is refused.
3. For photos taken with location on (a HEIC, a PNG, and one under 1600 pixels wide), the delivered copy has no GPS data (`exiftool`), and the stored copy has none either, checked with the Admin API's `image_metadata=true` using the preview key from `.env`.
4. Remove a photo by editing, and delete an update; within a few minutes, their saved URLs stop working.
5. Placeholders saved earlier still show as grey boxes.

## Turning photos on

Use two free Cloudinary accounts: one for production, and one for previews and local work. Previews run unmerged code, so they must never hold the key that can sign links to, or delete, real families' photos, just as they never touch the production database.

1. Create both accounts. In each, open Settings → Upload and delete any **unsigned** upload preset the account came with; uploads are signed by the server, and the cloud name is visible in every photo link.
2. In each account, copy the API environment variable from Settings → API Keys (`cloudinary://…`). It contains the secret: don't paste it into chat. Set the production account's with `npx vercel env add CLOUDINARY_URL production` and the preview account's with `npx vercel env add CLOUDINARY_URL preview`, pasting from the clipboard at the prompt. Put the preview account's in the local `.env`.
3. Redeploy a preview and run the hand check. Then redeploy production (`npx vercel redeploy <production url> --scope theothermelissa-s-team`) or merge any PR.

Turning photos off again is unsetting the variable and redeploying. Stored photos stay in Cloudinary and come back when it's set again; photo blocks show as grey boxes meanwhile. An update deleted while photos are off leaves its photos in Cloudinary with nothing in the app pointing to them, so only the leftovers clean-up can find them.

## Cut for speed

- **No reordering, video, or photos from supporters** (also the spec).
- **No photos or captions in emails**; only the count in the subject.
- **No links or formatting in captions.**
- **No stored photo dimensions**, so the loading box is always 4:3 and the page shifts slightly when a photo of another shape loads.
- **No clean-up of leftover Cloudinary photos.** They're private and reachable only by links saved earlier; `NEXT-SESSION.md`.
- **No check that an upload finished** before saving; a missing one is a broken image in that family's own feed.
- **No limit on upload requests** beyond Cloudinary's monthly credits.
- **No lightbox or grid**; photos are full width.
- **No retry of a failed upload**; remove it and choose it again.
## Progress and discoveries

**Slice 1 is implemented** on `feature/text-blocks`; `npm run typecheck` and `npm test` pass (151 tests).

- **Migration checked on a scratch database.** At `main`'s migrations, three updates (multi-line with a link; `'`, `"`, a backslash, and a literal `\n`; plain text) each became one text block equal to its `body`, at position 0. `prisma migrate diff` from the migrated database to the schema is empty.
- **Proving the tests can fail.** Each rule was removed in turn from a copy of `server/updates.ts`, and a test failed every time:
  - the family scope in the edit lock, and in delete: "refuses to edit or delete another family's update by ID"
  - the family scope in `listUpdates`: "lists only the person's own family's updates"
  - `requireFamilyMember` in create, edit, and delete: "lets a supporter read but not create, edit, or delete"
- **Signatures.** `createUpdate` and `editUpdate` take the request's `{ blocks, body }` object, and the feed's updates carry `blocks` instead of `body`. Tests that posted a string now post `{ body }`.
- The edit lock has no test of its own in slice 1, since only slice 3's photo deletion makes a lost edit dangerous; slice 3's race test covers it.
