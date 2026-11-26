# Implementation plan: public updates

Bridges the spec ([updates.md](spec/updates.md#public-updates), [access.md](spec/access.md#public-updates), [MASTER_SPEC.md](spec/MASTER_SPEC.md)) and the current code. One PR, sized for one session. Steps are in build order; each ends in a state that type-checks and passes tests.

## Settled

- Link-less design: the signed-out family page lists the latest 20 public updates. No per-update links, no paging.
- Public is a fourth audience, `public`, stored in the `Audience` enum. It is visible to everyone signed in exactly as `everyone` is.
- Only admins choose it; any family member edits a public update's text. Text and photo updates only.
- A family-level switch, off by default. Turning it off turns every public update into `everyone` in the same transaction, so no update is public while the switch is off.
- The signed-out page's banner is the family's public wording (or the standard public wording) only while it shows at least one public update.

## Cutting for speed (decisions, not accidents)

- No rate limit on the signed-out read. It's one cheap query; the gate GET already has none.
- No paging past 20, no live refresh, no admin "preview as a visitor" (a private window does it).
- Un-publishing doesn't revoke photo links already given. They're permanent signed links today (see "Stated limits"). Revoking means renaming the photo in Cloudinary. Goes to `NEXT-SESSION.md`.

## Schema

`prisma/migrations/20261127000000_public_updates/migration.sql` (sorts after `20261126000000_photo_taken_at`; `origin/main` has nothing newer):

- `ALTER TYPE "Audience" ADD VALUE 'public';` (nothing in the migration uses the new value.)
- `ALTER TABLE "Family" ADD COLUMN "publicUpdatesOn" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "publicNotice" TEXT;`

Mirror both in `prisma/schema.prisma`. Write the SQL by hand; check for drift with a scratch database (see `claude/lessons.md`, "Commands that fail in an agent's shell").

## Server

### `server/audience.ts` (the one place the rule lives)

- `AudienceInput` gains `"public"`; `AudienceView` gains `"public"`; `audienceView` returns it.
- `visibleUpdates`: a supporter's `OR` first branch becomes `{ audience: { in: ["everyone", "public"] } }`.
- `canSeeUpdate`: `everyone` and `public` both return `{ familyId }`.
- `parseAudience` accepts `"public"` for any family. Policy is not its job.
- `writeAudience`: `"public"` stores column `public` with no group rows. Under the groups lock it reads the family's `publicUpdatesOn` and throws 403 "Public updates are off" when false. This is the check that closes the race with turning the setting off.
- `audienceColumn` in `server/updates.ts` returns `"public"` for it.

### `server/updates.ts`

- `createUpdate` / `editUpdate`: `audience === "public"` requires `requireAdmin(person)`, checked before the transaction. The existing `audience !== "everyone"` branches already take `lockGroups` and call `writeAudience`, so `public` follows them.
- `editUpdate`: select the row's `audience` in the existing `FOR UPDATE` query. When it is `public`, a non-admin who sends any `audience` is refused 403, whatever the value. Admins can change it freely. Absent `audience` leaves it alone, as now.
- The video create path refuses `audience === "public"` (400). `editUpdate` already refuses videos.
- Export `withPhotoLinks` for the public read.

### `server/publicUpdates.ts` (new)

- `listPublicUpdates(db, family, settings)`: `where { familyId, audience: "public", videoId: null, family: { publicUpdatesOn: true } }`, newest first, `take: 20`. Selects only `id`, `content`, `body`, `createdAt`, the photo public IDs, and reactions `{ kind }` filtered by `visibleReactors`. No author, notes, `editedAt`, audience, or photo dates are read. Content goes through `shownContent` and `withPhotoLinks`, so a photo link is made only for a row of an update that just matched `public`.
- Returns `{ id, content, createdAt, reactions: { count, kinds } }`. `kinds` are the used emoji, most-used first, ties in catalog order (reuse the ordering from `reactionsView`; export a small helper from `server/reactions.ts` rather than duplicating).
- `setPublicUpdates(db, person, { on })`: `requireAdmin`; transaction: `lockGroups`; when turning off, `updateMany` `public` to `everyone` for the family and count them; set the flag; return `{ on, converted }`.
- `setPublicNotice(db, person, { publicNotice })`: same rules as `setPrivacyNotice` (admin, one line, 300 characters, empty means `null`). Share the parsing with it.

### Handlers

- `api/f/[slug]/gate.ts` GET: `{ ...gateInfo(family), publicUpdates, ...(publicUpdates.length > 0 ? { publicNotice: family.publicNotice } : {}) }`. A family's wording never goes out unless the page shows public updates.
- New `api/f/[slug]/public-updates.ts` (PUT `{ on }`) and `public-notice.ts` (PUT `{ publicNotice }`), modeled on `privacy-notice.ts`.
- `api/f/[slug]/me.ts`: add `family.publicUpdates` (the flag) for the post form.
- `server/people.ts` `listPeople` (admin branch only): add `publicUpdatesOn`, `publicNotice`, and `publicUpdateCount` for the confirmation text. A non-admin's read-only branch gets none of them.

## Frontend

- `src/lib/privacyNotice.ts`: `STANDARD_PUBLIC_NOTICE` ("These updates are shared publicly by the family. Please be kind and respect their privacy.").
- `src/audience.ts`: `Audience` and `AudienceChoice.mode` gain `"public"`; the choice carries `understood`. `choiceFor("public")` starts understood (so editing one needs no re-confirmation). Choosing Public from another mode starts not understood. `canShare` requires `understood` for public. `audienceBody` sends `"public"`; `changedAudience` and `audienceLabel` ("Public") follow. Unit tests in `src/audience.test.ts`.
- `src/components/postSettings.tsx`: new `offerPublic` prop. A **Public** radio after the others with the warning text and the "I understand" checkbox, a globe icon, and "Public" in `AUDIENCE_LABELS`. `choosingAudience` is true whenever `offerPublic` or the mode is public. A non-admin on a public update gets the chooser with every radio disabled and no checkbox.
- `src/pages/Feed.tsx`: pass `offerPublic` (admin, the family's flag, and not the Video tab). Switching to the Video tab while Public is chosen resets the audience to Everyone. The label shows "Public".
- `src/api.ts`: `Me.family.publicUpdates`; People response fields.
- `src/components/publicUpdates.tsx` (new): the **Public updates** heading, one card per update: the family's display name and posted time, `RichText`, the three-emoji summary and count with an accessible label, no controls.
- `src/pages/Gate.tsx`: both gates render the section below the form, and render the banner themselves: the public wording when `publicUpdates.length > 0`, otherwise the standard one. `src/pages/FamilyFrame.tsx` drops its banner in the signed-out branch (the not-found branch keeps it) and its comment is updated, since the gate now places its own.
- `src/pages/People.tsx`: a **Public updates** section after "Notes on new updates" (admin only): the checkbox saving at once with "Saved"; unchecking opens the inline confirmation with the count; the banner text box with **Save banner**.

## Tests

Integration (real Postgres), new `tests/integration/publicUpdates.test.ts`, plus additions to existing files:

1. **Anonymous read** (calls the `gate` handler with no cookie): returns only `public` updates of that family; never `everyone`, group, or family-only ones; never another family's; none while the flag is off even when a row is `public`; never a video update.
2. **What it leaves out:** no author name, notes, reactor names, audience, taken dates, `editedAt`, or a person's name anywhere in the response.
3. **Photos:** a public update's photo gets a link; changing it to `everyone` makes the next request return no update and no link; a photo on a non-public update never appears.
4. **Banner wording:** `publicNotice` is absent when there are no public updates and present when there are.
5. **Permissions:** a non-admin can't create, set, or unset public, and can edit a public update's text; an admin can; a supporter can't; public is refused for a video update and while the flag is off.
6. **Turning off:** converts every public update to `everyone`, only in the admin's family, and returns the count; a non-admin is refused.
7. **Races (deterministic):** hold `lockGroups` in a test transaction, start a public create, wait until it is queued in `pg_locks` (`queuedOrDone`), turn the flag off and commit; the create must be refused. The same for an edit.
8. **Signed-in visibility** in `audience.test.ts`: a supporter in no group and one in a group both see a public update in the feed, and `canSeeUpdate` includes both (notifications reach them like an `everyone` update, in `notifications.test.ts`).

**Prove each can fail.** Copy the changed server files to the scratchpad first, then remove each rule in turn and watch its test fail: the `audience: "public"` filter, the `publicUpdatesOn` filter in the read, `videoId: null`, the admin check on create, the admin check on a public update's audience change, the flag check inside `writeAudience`, and the conversion on turn-off. For the race, check it fails every time without the lock, not once.

Unit tests: `src/audience.test.ts` for the public choice (`understood`, `changedAudience`, label); nothing else is non-trivial pure logic.

## Verify by hand

Typecheck and `npm test`, then a browser pass at 360px and desktop on the preview family: posting public as an admin (the warning, the checkbox), a non-admin editing one, the signed-out page in a private window (banner, count, photos), unpublishing, and turning the setting off. Leave the camera/video paths alone.

## Steps

1. Migration, schema, `server/audience.ts`, `server/updates.ts`, `server/publicUpdates.ts`, handlers, `people.ts`, with the integration tests and mutation proofs.
2. Frontend: audience helpers, post settings, feed, gate, banner, People page.
3. Browser pass, PR, CI, preview, hand-off to Melissa.
4. After merge: remove the entry from `NEXT-SESSION.md`, add the deferrals above, move this plan to `docs/completed-plans/`, update `claude/lessons.md` only if something new was learned.
