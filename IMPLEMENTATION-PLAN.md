# Implementation Plan — Formatted updates with photos

Implements `spec/updates.md` → "An update," "The feed," "Writing an update," "Editing," "Deleting," and "Photos," with the matching lines in `spec/MASTER_SPEC.md` (scope, the Cloudinary exception to "served from the app's own domain," the photo-count exception to "emails carry no update content") and `spec/access.md` (photos and captions follow the update's visibility; the photo paragraph in Stated limits).

Three slices, each its own PR and sized for one session, each safe to ship on its own:

1. **Formatted text.** A Tiptap editor replaces the plain text box; updates are stored as a validated document. Existing updates look the same.
2. **Photos with placeholders.** A photo node with captions, the photo count in email subjects, and grey placeholder photos on test sites (`PHOTO_PLACEHOLDERS=1`), so Melissa can try everything on a preview without a Cloudinary key. Production has no photo controls.
3. **Real photos with Cloudinary.** Signed uploads, signed links, deletion from Cloudinary, the loading box. Off in production until Melissa sets the key (see "Turning photos on").

## Design

### The document

An update's content is a Tiptap (ProseMirror) JSON document, stored in a new nullable `Update.content` (`JSONB`) column. The allowed shape, and nothing else:

- `doc` → one or more of `paragraph`, `bulletList`, `orderedList`, and (slice 2) `photo`
- `paragraph` → zero or more `text` and `hardBreak` (an empty paragraph has no `content` key)
- `bulletList` / `orderedList` → one or more `listItem`; `orderedList` may have `attrs.start` and `attrs.type`, which pasted lists fill from the source (Google Docs and Word give `type` values like `"a"` or `"i"`, and `start` is parsed with no checks), so they're normalized rather than refused: `type` is stored as null, and `start` is kept only if it's an integer from 1 to 9,999, otherwise 1
- `listItem` → a `paragraph`, then any number of `paragraph`, `bulletList`, or `orderedList`
- `text` → a non-empty `text` string with no newline (the editor uses `hardBreak`) and optional `marks`, at most three: `bold`, `italic`, or `link` with `attrs.href`, each at most once
- `photo` (slice 2) → `attrs` with `caption` (string, at most 300 characters after trimming, empty stored as `""`) and exactly one of `placeholder: true` or `publicId`; only directly under `doc`, not inside lists

Tiptap 3.32 writes every link attribute, nulls included (`href`, `target`, `rel`, `class`, `title`), and may write marks on a `hardBreak`; the validator accepts exactly those known extras and drops them, keeping only `href`. Every other key, node type, mark type, or attribute is a 400. If a Tiptap upgrade adds an attribute, the jsdom test below fails before users see 400s.

**Validation** is a small hand-written function, `validDoc(input, settings, familyId)` in `server/richText.ts`. It walks the input and **builds a new document from the fields it checked**, so nothing it didn't look at can reach the database. On top of the shape:
- `href` must pass `allowedHref`: it parses with `new URL()`, has protocol `http:`, `https:`, or `mailto:`, is at most 2,000 characters, and contains no whitespace or control characters (so `java\nscript:` and ` javascript:` are refused rather than normalized). `allowedHref` lives in one shared file, `src/lib/links.ts` (with `linkify`, moved there), used by the validator, `docFromText`, the editor, and the renderer, so they can't disagree.
- at most 20,000 characters of text in all (today's body limit), at most 10,000 nodes (hard breaks included; an old body can have many line breaks), at most 10 levels deep (three levels of nested lists); the walk stops at the first node past either limit, and checks a `marks` array's length before looking for repeats
- not empty: at least one non-whitespace character of text, or (slice 2) a photo
- at most six photos, no repeated `publicId`, and the photo rules from slices 2 and 3

**No Tiptap on the server.** The validator is about 120 lines and checks exactly the rules above; running Tiptap or ProseMirror on the server would need a DOM shim and would accept whatever its schema allows, which is what we're trying to pin down.

**Reading.** `listUpdates` returns each update's `content`: the stored document, or `docFromText(body)` when `content` is null or `textOf(content)` differs from `body` (see the deploy window, below). The client draws it with `src/richText.tsx`, a small renderer that maps each node type to a React element (`<p>`, `<br>`, `<strong>`, `<em>`, `<ul>`, `<ol start>`, `<li>`, `<a>`, and in slice 2 `<figure>` and `<figcaption>`) and ignores anything it doesn't know, never throwing on a malformed document, so one bad row can't take down the feed. Text is always a React text child; there is no `dangerouslySetInnerHTML` and no `generateHTML`, and no `style` or `class` from the document. Links get `target="_blank"` and `rel="noopener noreferrer"`, as today, and a link failing `allowedHref` is drawn as plain text, in case anything ever slips past the server. Paragraphs keep today's `whitespace-pre-wrap break-words`, an empty paragraph draws as `<p><br></p>`, and paragraphs are spaced one line apart, so a blank line looks as it does now.

### Existing updates and the deploy window

The migration only adds the nullable `content` column. Nothing is rewritten:

- **Converting in code, not in SQL.** An update with no `content` is shown with `docFromText(body)`: the text is split into paragraphs at each `\n\n`, remaining newlines become `hardBreak`s (so extra blank lines survive as empty paragraphs or leading breaks), and web addresses become link marks using today's `linkify`, kept only where they pass `allowedHref`. `textOf(docFromText(body))` gives back `body` exactly, and existing updates look as they do now. The read path needs this fallback anyway, for updates the old code posts while the migration runs, so converting existing rows in SQL would add a second, harder-to-test conversion without removing the first. `docFromText` is a pure function with unit tests on the tricky cases.
- **`body` stays**, and the new code writes it as the document's plain text (`textOf(doc)`: paragraphs separated by blank lines, line breaks as newlines, list items prefixed with "- " or "1. "), so the old code still works during the deploy and if it's ever redeployed.
- **Old requests still work.** A request with `content` uses only `content`; otherwise a string `body` goes through `docFromText`. A family member whose page loaded before the deploy can still post and edit.
- **No stale edits.** During the deploy minute no update has `content` yet, so an edit the old code saves there shows correctly. After a rollback to the old code, though, it could edit `body` on an update that has `content`; the read rule above (`textOf(content)` differs from `body` → show `body`) keeps that edit visible. The new code always writes `body` as `textOf` of the content it stores, so the two agree otherwise.
- **No JSON null.** "No content" is SQL `NULL` (`Prisma.DbNull`), never a JSON `null`.
- Backfilling `content`, making it required, and dropping `body` and `{ body }` go in `NEXT-SESSION.md`.

### Writing and editing

`createUpdate(db, person, input, notifyWith?)` and `editUpdate(db, person, id, input)` take the request's `{ content, body }`. Editing locks the update (`SELECT … FROM "Update" WHERE id = $1 AND "familyId" = $2 FOR UPDATE`; no row is a 404) in an interactive transaction; slice 3 relies on the lock to know which photos an edit dropped.

### The editor

`src/editor/RichEditor.tsx`, loaded with `React.lazy` only when a family member opens the post form or an edit, so supporters never download it. Tiptap with `StarterKit.configure(...)` turning off `heading`, `blockquote`, `codeBlock`, `code`, `horizontalRule`, `strike`, and `underline`, and configuring `link` with `openOnClick: false`, `autolink: true`, `linkOnPaste: true`, and `defaultProtocol: "https"` (linkify already handles `mailto:`). Link checks in Tiptap are scattered, and `linkOnPaste`'s handler skips `isAllowedUri` while linkify also recognizes `ftp:` and `file:`, so:
  - `shouldAutoLink` (used by autolink, the paste rule, and the paste handler) refuses any explicit scheme other than `http:`, `https:`, or `mailto:`
  - `isAllowedUri` uses `allowedHref` when there's a scheme, and linkify's test when there isn't (so `www.example.com` and `ana@example.com` still become links, and relative links like `/wiki/x` don't)
  - before sending, the editor drops any link mark that fails `allowedHref`, so a stray link can never make the whole post fail Bold, italic, the lists, hard breaks, undo/redo, and the gap and drop cursors stay on.

- **Paste.** ProseMirror parses pasted HTML against the editor's schema, so elements it has no node or mark for (headings become paragraphs, tables and images disappear, colors and fonts are dropped) keep only their text. A link with a refused scheme loses its link. The server validator is the backstop.
- **Toolbar** (shadcn `Button`, `variant="ghost"`, sized `size-11` for 44-pixel tap targets, `aria-pressed` for active formatting, `aria-label`s): Bold, Italic, Link, Bulleted list, Numbered list. "Link" opens an inline `Input` under the toolbar with "Apply" and "Remove link" (never `prompt()`, per `claude/lessons.md`); it adds `https://` to an address with no scheme, and shows a message when the address is refused instead of failing silently.
- **Styling.** Tailwind's reset removes list bullets and spacing, so the editor and the renderer share classes for paragraphs and lists (`list-disc`, `list-decimal`, `pl-6`, `space-y-2`), and the editor area matches `Textarea`'s border and focus ring.
- Posting sends `{ content: editor.getJSON(), notify }`; Post and Save are disabled while the editor is empty.

### Photos (slices 2 and 3)

**The photo node** is a Tiptap atom node, `draggable: false`, with a React node view: the photo (or a grey 4:3 box), a caption `Input`, and "Remove." It has **no HTML parse rule**, so no paste, including copying a photo within the editor or from another update, can create one; only "Add photo" can, at the cursor.

**A `Photo` table** (`id`, `updateId` with cascade, `publicId` unique) holds each real photo's Cloudinary ID, written in the same transaction as the content and replaced on edit. It keeps one photo on one update at a time (a duplicate is a 409), makes "which photos does this update have" one query for deletion, and backs a read-side check: the feed signs a URL only for a `publicId` that has a `Photo` row for that update. Placeholders exist only in the document.

**Photo settings.** `photoSettingsFromEnv()`, used only by handlers, returns `{ cloudinary: Cloudinary | null, placeholders: boolean }`. `placeholders` is true only when `PHOTO_PLACEHOLDERS === "1"` **and** `VERCEL_ENV !== "production"`. `PHOTO_PLACEHOLDERS` is set only in Vercel's Preview variables and the local `.env`; production ignores it even if it's set there by mistake. Server functions take the settings as an argument, never reading the environment, so tests can't reach the network even if Melissa's `.env` has a key. `/me` reports `family.photos` as `"real"` (Cloudinary on; real uploads win), `"placeholder"`, or `"off"`.

**Photo rules in `validDoc`:** a placeholder needs placeholders on. A `publicId` already on the update being edited is accepted whatever the settings, so turning photos off, or rolling back a slice, never stops a family editing an update that has photos. A new `publicId` needs Cloudinary on and must be `families/<this person's familyId>/` followed by exactly 22 characters of `[A-Za-z0-9_-]`, anchored at both ends. Placeholders saved earlier stay accepted on edit only while placeholders are on (accepted for test sites).

**In the feed,** photo nodes carry `url` (a signed link, or null for a placeholder, for a photo with no `Photo` row, or when Cloudinary is off) and `publicId`; the client draws a null `url` as the grey box. Each URL already contains its public ID and the family's ID, which is harmless: attaching checks the *attacher's* family. When the editor sends a document back, the validator drops `url`.

**Emails** get the photo count in the subject: " (1 photo)" or " (N photos)", placeholders included. The body is unchanged and carries no content.

### Cloudinary (slice 3)

Everything below was checked on 2026-10-15 against cloudinary.com/documentation (`authentication_signatures`, `delivery_url_signatures`, `control_access_to_media`, `transformations_on_upload`, `transformation_reference`, `image_upload_api_reference`); both documented signature examples were reproduced locally.

- **Hand-written, no SDK.** Two short pure signing functions and one `fetch` for deletion, about 40 lines, each tested against Cloudinary's documented examples (`bfd09f95f331f558cbd1320e67aa8d488770583e` for upload, `s--iDy_JeBq--` for delivery). The `cloudinary` package (2.11, with lodash) reads `CLOUDINARY_URL` from global state, and its upload widget is a third-party script the product-wide rules don't allow.
- **Signed uploads straight to Cloudinary** (Vercel caps request bodies at 4.5 MB). `POST /api/f/<slug>/photo-upload` (family members only) signs exactly: `public_id` (`families/<familyId>/<22 random URL-safe characters>`), `type=authenticated`, `transformation=c_limit,w_1600,fl_force_strip` (applied before storing; `fl_force_strip` is what removes metadata from an incoming transformation), `allowed_formats=jpg,png,webp,gif,heic,heif`, `overwrite=false`, and `timestamp`. Every field sent must be signed, so the browser can't add or change one. The browser sends the file as a nameless `Blob` and reads only `public_id` from the reply, never `secure_url`.
- **Delivery.** `photoUrl(config, publicId)` always returns `https://res.cloudinary.com/<cloud>/image/authenticated/s--<sig>--/c_limit,w_1600/f_auto/q_auto/<publicId>`; the transformation is a constant inside the function. If signed on-the-fly transformations turn out not to work for authenticated assets (the docs contradict each other), the fallback is `f_jpg/q_auto`, signed as `eager` at upload and used unchanged in the URL.
- **Deletion after commit.** `deleteUpdate` and `editUpdate` lock the update, read its `Photo` rows, delete or replace them, and only after commit call `destroy` (Basic Auth, `type=authenticated`, `invalidate=true`) in parallel with a 5-second timeout each. A failure is logged with the update ID and a count, not the IDs, and the request still succeeds; the photo has already left the app (spec: Stated limits).
- **Two Cloudinary accounts,** production and previews/local, so unmerged code never holds the key to real families' photos.

## Slice 1 — Formatted text

1. **Migration `rich_text`**: `ALTER TABLE "Update" ADD COLUMN "content" JSONB;` (written by hand if `prisma migrate dev` won't run).
2. **`src/lib/links.ts`**: `allowedHref`, and `linkify` moved from `src/linkify.ts` with its test. **`server/richText.ts`**: `validDoc` (photo nodes refused until slice 2), `docFromText`, `textOf`, and `contentFrom(input)` (content wins, else body). The server imports `src/lib/links.ts` directly; it has no browser or React dependencies.
3. **`server/updates.ts`**: create, edit (with the lock), and list use `content`, keeping `body` in step; the feed's updates carry `content` instead of `body`.
4. **Handlers** pass the request body through.
5. **`src/richText.tsx`**: the renderer. **`src/editor/RichEditor.tsx`**: the editor and toolbar, lazy-loaded. **`src/pages/Feed.tsx`**: the post form and edit use the editor; updates render with the renderer.
6. **Dependencies**: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` (3.32; starter-kit includes `Link` in v3). Measured in a scratch Vite build with React 19: about 400 KB more JavaScript (about 126 KB gzipped), all in the lazy editor chunk, so supporters' pages don't grow beyond the small renderer. `jsdom` as a dev dependency, for one test that runs the real editor.
7. **`NEXT-SESSION.md`**: backfill `content`, then drop `body` and `{ body }`.

**Tests.**
- **Unit, `server/richText.test.ts`:**
  - accepts documents captured from the real editor (bold, italic, a link with Tiptap's default attributes, nested bullet and numbered lists, an ordered list starting at 3, hard breaks) and returns them with link attributes reduced to `href`
  - accepts an empty paragraph with no `content`, marks on a `hardBreak`, and a link with all five Tiptap attributes; normalizes `orderedList` `type: "a"` to null and `start` of 0, -3, 10,000, `null`, or `"5"` to 1
  - refuses: `heading`, `image`, `codeBlock`, `blockquote`, `horizontalRule`, a `photo` node, and an unknown node; `code`, `strike`, `underline`, `textStyle`, and an unknown mark; an unknown key on any node, mark, or `attrs`; a repeated mark and more than three marks; empty or non-string text, and text containing a newline; a list with no items; a `listItem` not starting with a paragraph; a list directly in a paragraph
  - refuses `href`s: `javascript:alert(1)`, `JAVASCRIPT:…`, ` javascript:…`, `java\nscript:…`, `data:text/html,…`, `vbscript:…`, `/relative`, `//example.com`, `file:///…`, an unparseable string, and one over 2,000 characters; accepts `https://…`, `http://…`, and `mailto:ana@example.com`
  - refuses 20,001 characters of text (one node and spread across many), 10,001 nodes, 11 levels of nesting, an empty document, and one with only whitespace
  - `docFromText` on quotes, a backslash, a literal `\n`, emoji, `\r\n`, three or more newlines, leading and trailing spaces, and URLs with trailing punctuation gives the expected paragraphs, breaks, and link marks, and `textOf` of the result gives back the original text exactly (after `\r\n` becomes `\n`); a bare `https://` and a 2,001-character URL stay plain text
  - content wins over body; body alone is converted
- **Unit, `src/richText.test.tsx`** (`renderToStaticMarkup`): each node and mark renders as expected; links have `target="_blank"` and `rel="noopener noreferrer"`; text containing `<script>` comes out escaped; a `javascript:` link and an unknown node render as plain text or nothing.
- **Unit, `src/editor/schema.test.ts`** (`// @vitest-environment jsdom`): a headless Tiptap editor with the app's extensions is given pasted-style HTML with headings, a table, an image, a `<script>`, colors, a `javascript:` link, an `ftp://` link, a blockquote, and a Google Docs lettered list (`list-style-type: lower-alpha`); its `getJSON()` passes `validDoc`, contains none of those, and keeps their text. This also catches the editor and validator drifting apart.
- **Integration, `tests/integration/updates.test.ts`:** the existing cross-family, supporter, and edit/delete tests rewritten for `content`, each shown failing with its rule removed (family scope on list, edit lock, and delete; `requireFamilyMember` on create, edit, and delete). Added: content round-trips; `body` is kept in step; an update whose `body` was changed directly (as rolled-back code would) shows the new `body`; an update with `content` null (inserted directly) comes back as the converted document with link marks; `{ body }` still posts and edits; content wins when both are sent; an invalid document stores nothing and leaves an edited update unchanged.
- **Migration:** on a scratch database at `main`'s migrations with updates holding quotes, backslashes, a literal `\n`, URLs, and emoji, apply `rich_text` and confirm the feed shows each one as before; `prisma migrate diff` shows no drift. After the preview builds, the test family's earlier updates look unchanged.
- **Hand check on the preview:** existing updates look the same; bold, italic, links (typed, pasted, and through the Link field, plus `mailto:`), and nested lists; paste from a web page and from Google Docs or Word; a supporter sees the formatting in a private window; editing keeps the formatting; on a phone, the toolbar is easy to tap; the notification email is unchanged.

## Slice 2 — Photos with placeholders

1. **Migration `photos`**: `model Photo` (additive).
2. **`server/photoSettings.ts`** with `placeholders` (Cloudinary is null until slice 3).
3. **`validDoc`**: the photo node, captions, six-photo limit, placeholder rule; any `publicId` is refused until slice 3.
4. **`server/updates.ts`**: photo count to `notifySupporters`; **`server/email.ts`**: the subject suffix.
5. **`/me`**: `family.photos`.
6. **Editor**: the photo node and "Add photo" (unless `"off"`); with placeholders, choosing a photo inserts a grey card and uploads nothing. If placeholders are later turned off on a test site, saving an update that still has one shows the server's message naming the placeholder. **Renderer**: `<figure>` with a grey 4:3 box (`aspect-ratio: 4 / 3`) and `<figcaption>` when the caption isn't empty.
7. **Config**: `PHOTO_PLACEHOLDERS=""` in `.env.example`; a README row ("Preview only, `1`. Production ignores it."). Melissa sets it in Vercel's Preview variables.

**Tests.** Unit: photo nodes with and without captions; caption trimming, 301 characters refused, non-string refused; seven photos refused; a photo inside a list refused; `placeholder` other than `true`, neither key, both keys, `{ placeholder: false, publicId }`, `publicId: null`, and an unknown attribute refused; placeholders refused when off; `url` dropped; any `publicId` refused while Cloudinary is off. `photoSettings`: placeholders only for exactly `1`, never with `VERCEL_ENV=production`; tests clear `PHOTO_PLACEHOLDERS`, `VERCEL_ENV`, and `CLOUDINARY_URL` first. The jsdom test: pasting HTML that looks like a photo node creates none. Integration: with placeholders on, text–photo–text round-trips and Sam sees the caption with `url: null`; Olu's serialized feed has no Rivera caption; with placeholders off, a placeholder is a 400 and stores nothing; subjects say " (2 photos)", " (1 photo)", or nothing, and bodies contain no caption or text.

## Slice 3 — Real photos with Cloudinary

1. **`server/cloudinary.ts`**: `parseCloudinaryUrl`, `signParams`, `signPath`, `photoUrl`, `destroyPhotos`.
2. **`photoSettings`**: `cloudinary` from `CLOUDINARY_URL`. **`server/photos.ts`**: `uploadFields`. **`api/f/[slug]/photo-upload.ts`** (POST).
3. **`validDoc`**: `publicId` photos with the prefix check and the kept-photo rule. **`server/updates.ts`**: `Photo` rows written and replaced with the content; `P2002` becomes a 409; signed `url`s only for photos with a row on that update; deletion after commit in delete and edit.
4. **Editor**: real uploads with a local preview and "Uploading…"; the 10 MB check; saving waits for uploads. **Renderer**: `<img alt="Photo N of M" loading="lazy">` at full width in a grey 4:3 box until it loads.
5. **Config and docs**: `CLOUDINARY_URL` in `.env.example`, README rows, "Turning photos on."
6. **`NEXT-SESSION.md`**: clear up Cloudinary leftovers (uploaded but never saved, failed deletions, deleted while photos were off, files posted to the `raw` or `video` endpoints with signed fields).

**Tests** (fake Cloudinary with secret `abcd` and a recording `destroy`; handler tests set and restore `CLOUDINARY_URL`, `PHOTO_PLACEHOLDERS`, and `DATABASE_URL`; each access test shown failing with its rule removed):
- Upload fields signed over exactly the six fields above, with a Rivera-prefixed ID, different each time; through the handler, no session and Olu's token under Rivera's cookie are 401, Sam is 403, and with Cloudinary off Ana gets 404.
- Attaching: an Okafor-prefixed ID, an ID with both prefixes, a malformed ID, a repeated ID, and a new ID while Cloudinary is off are 400s that store nothing; an ID on another update is a 409 on post and on edit, and stays where it was.
- With Cloudinary on and placeholders off, a placeholder is a 400, including through the handler.
- Reading: Sam gets signed URLs matching the full `photoUrl` pattern; Olu's serialized feed has no Rivera ID, URL, or caption; a photo node whose `publicId` has no `Photo` row for that update gets no URL; a removed Sam gets 401 through the updates handler.
- Deleting calls `destroy` with exactly the update's IDs and removes its rows; another family's update is a 404 that destroys nothing; a failing `destroy` still deletes.
- Editing: a dropped photo is destroyed after commit, a kept one isn't, a failed edit destroys nothing; with Cloudinary off, editing the text of an update with a photo keeps it; an edit racing a delete is either refused or has its photo destroyed, made deterministic with a held row lock as the gate-lock tests do.
- Unit: the two documented signature examples; `photoUrl` always has the fixed transformation and never `fl_keep`; `parseCloudinaryUrl`; `destroyPhotos` with `fetch` stubbed.

**Hand check** on a preview with the preview account: text–photo–text with a portrait iPhone HEIC shows upright, with the grey box while loading (if photos don't load, switch to the eager fallback); a URL with its signature removed or its transformation changed is refused; delivered and stored copies (Admin API `image_metadata=true`, with the preview key from `.env`) of a HEIC, a PNG, and a photo under 1600 pixels wide have no GPS data; a removed photo's and a deleted update's URLs stop working within a few minutes; earlier placeholders still show grey.

## Turning photos on

Use two free Cloudinary accounts: one for production, and one for previews and local work. Previews run unmerged code, so they must never hold the key that can sign links to, or delete, real families' photos.

1. Create both accounts. In each, open Settings → Upload and delete any **unsigned** upload preset the account came with.
2. In each, copy the API environment variable from Settings → API Keys (`cloudinary://…`). It contains the secret: don't paste it into chat. Set the production account's with `npx vercel env add CLOUDINARY_URL production` and the preview account's with `npx vercel env add CLOUDINARY_URL preview`, pasting at the prompt. Put the preview account's in the local `.env`.
3. Redeploy a preview and run the hand check, then redeploy production (`npx vercel redeploy <production url> --scope theothermelissa-s-team`) or merge any PR.

Turning photos off is unsetting the variable and redeploying. Stored photos stay in Cloudinary and come back when it's set again; photos show as grey boxes meanwhile. An update deleted while photos are off leaves its photos in Cloudinary with nothing pointing to them, so only the leftovers clean-up can find them.

## The preview database

The text-blocks attempt (closed PR #24) applied a `blocks` migration to the shared preview database: a `Block` table, a `BlockKind` type, and a row in `_prisma_migrations`. Tested on a scratch database: `prisma migrate deploy` ignores an applied migration that isn't in the repository and applies new ones normally, and nothing in this plan touches `Block`, so **previews keep working with no action**. The leftovers are harmless (`Block` cascades when an update is deleted). To tidy up, either recreate the `preview` branch (README → Deployment), or run against the preview database: `DROP TABLE "Block"; DROP TYPE "BlockKind"; DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016010000_blocks';`. Production never had it: PR #24 wasn't merged, and production builds only from `main`, whose migrations end at `one_reaction_per_person`.

## Cut for speed

- **No headings, underline, strikethrough, quotes, code, colors, tables, or images by URL** (also the spec).
- **No dragging or reordering photos, no video, no photos from supporters.**
- **No photos or captions in emails**; only the count in the subject.
- **No links or formatting in captions.**
- **No backfill of `content`** for existing updates; they're converted when read.
- **No stored photo dimensions**, so the loading box is always 4:3.
- **No clean-up of leftover Cloudinary photos, no check that an upload finished, no upload rate limit, no lightbox or grid, no retry of a failed upload.**

## Progress and discoveries

Not started.
