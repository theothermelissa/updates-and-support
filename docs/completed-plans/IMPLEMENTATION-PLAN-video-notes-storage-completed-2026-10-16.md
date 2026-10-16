# Implementation Plan: Video notes, part 1 (storage, access, upload)

Spec: [updates.md → Video notes](spec/updates.md#video-notes), the video-link limit in [access.md → Stated limits](spec/access.md#stated-limits), and the domain rule in [MASTER_SPEC.md](spec/MASTER_SPEC.md#product-wide-rules).

Video notes ship in two plans:

1. **This plan:** storing, authorizing, showing, and deleting video notes, with "Upload a video" as the only way to make one. When it lands, someone can pick a video file, review it, post it, and everyone in the family sees it on a 16:9 card and plays it.
2. **The next plan:** the in-page recorder, meaning the camera view, the 3-2-1 countdown, the 60-second timer, and "Re-record." It feeds the same review and upload path.

This plan goes first because it carries the privacy risk, and every rule in it gets an integration test.

## How it works

Videos never pass through our server. Vercel caps a function's request body at 4.5MB, and the browser uploads straight to Cloudinary instead.

1. **Ticket.** The browser asks `POST /api/f/<slug>/notes/video` for an upload ticket. The server checks the person is signed in and not removed, and under the ticket limit. It then picks a random public ID under `CLOUDINARY_FOLDER`, records the ticket (who it's for and when), and returns signed upload parameters.

2. **Upload.** The browser uploads the file to Cloudinary's `/video/upload` with those parameters, sending it under the fixed filename `video`. Cloudinary keeps the original filename, and one like "chemo-day-3.mov" would otherwise show in the shared console.
   - The signed parameters fix:
     - the public ID;
     - `type: authenticated`, so the video is never publicly addressable;
     - `overwrite: false`, so a posted video can't be swapped out later;
     - the eager conversions (mp4 and a poster still);
     - `eager_async: true`, so conversions run after the upload rather than during it.
   - Nothing about the family or person goes in `tags` or `context`.
   - Cloudinary doesn't sign `resource_type`, which is part of the upload URL. A client could reuse the parameters to upload an image or raw file under the same ID. That stays harmless because the server only ever describes, signs, and destroys with `resource_type: "video", type: "authenticated"`, so anything else looks missing.

3. **Attach.** The browser posts the note: `POST /notes` with `{ updateId, color, name?, video: publicId }`. The server checks in this order:
   1. **The ticket, before any Cloudinary call.** It must exist and belong to this person. The Cloudinary environment is shared with other projects, so the server never acts on a public ID it didn't issue to this person.
   2. **The video itself.** `describe` asks Cloudinary's Admin API about the video. It must exist as an authenticated video of at most 61 seconds; the extra second allows for container rounding. Anything else is refused. A refused video is left in Cloudinary for the orphan sweep (see "Cut for speed"), so attaching never deletes anything.
   3. **The existing transaction.** It locks the author, checks the update is in their family, checks the hourly limit, and creates the note with `videoId`. `Note.videoId` is unique, so a ticket attaches at most one note, and a reuse is refused when the unique constraint fails (P2002).

4. **View.** `noteView` adds `video: { src, poster } | null`. These are signed Cloudinary delivery URLs for the derived mp4 and still, computed locally with no API call. The original file is never linked, so location metadata in phone videos doesn't reach anyone. The server builds the URLs only inside the existing `visibleNotes` queries, so a link exists only for someone signed in to the family.

5. **Delete.** Videos are deleted from Cloudinary **before** the database rows, and only after the person is authorized.
   - Every destroy passes `resource_type: "video", type: "authenticated", invalidate: true`. The defaults are image, upload, and no invalidation, which would delete nothing and leave CDN copies playing.
   - If Cloudinary fails, the request fails and the note stays, so the person can try again. A video that's already gone counts as deleted, so retrying after a half-finished delete works.
   - `deleteNote`: find the note the person may delete, destroy its video, then delete the row.
   - `deleteUpdate`, in one transaction:
     1. lock the update row (`SELECT … FOR UPDATE`) in the person's family;
     2. read the `videoId` of **every** note on it, including notes by removed authors, which the cascade also deletes;
     3. destroy those videos;
     4. delete the update.
   - The lock matters because a note insert's foreign-key check waits behind it. Without the lock, a video attached mid-delete would lose its row but keep its video and its live links. With it, a concurrent attach waits and then gets "Update not found." The transaction gets a longer timeout, since it waits on Cloudinary.

### Cloudinary access goes through one small interface

`server/videos.ts` defines `VideoStore`, with four methods:

- `uploadParams(publicId)`
- `describe(publicId)`, which returns `{ duration } | null`; it returns null unless the asset is an authenticated video
- `destroy(publicIds)`
- `urls(publicId)`

Its Cloudinary implementation uses the official `cloudinary` SDK, server only.

Integration tests pass a fake store, the same way they pass `fakeMailer`, so tests and CI never touch Cloudinary. The fake records every call and its options, so tests can check what was called. Server functions take the store as a parameter, and handlers pass the real one.

**Dependency:** `cloudinary` (v2) earns its place. It signs uploads and delivery URLs and calls the Admin API, and hand-rolling signatures for an access boundary would be riskier than using the official code.

### Data

```prisma
model Note {
  // body is "" for a video note
  videoId String? @unique   // Cloudinary public ID
}

model VideoUpload {          // an upload ticket
  publicId  String   @id
  personId  String
  createdAt DateTime @default(now())
  person    Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
  @@index([personId, createdAt])
}
```

A hand-written migration adds a check constraint: a note has a non-empty body **or** a `videoId`, never both and never neither.

The hourly limit stays at 20 notes, written and video together, as the spec says. Tickets have their own cap of 20 an hour per person. A used or abandoned ticket still counts, so nobody can fill storage by requesting tickets and uploading without ever posting.

### Configuration

- `CLOUDINARY_URL` (`cloudinary://key:secret@cloud`) is read by the SDK. It goes in Vercel's Production and Preview settings, and in `.env` for local use.
- `CLOUDINARY_FOLDER` sets the prefix for public IDs: `updates-and-support/production`, `updates-and-support/preview`, or `updates-and-support/dev`. The Cloudinary environment is shared with your other projects, so the folder keeps this app's videos apart, and keeps preview and dev videos apart from real ones.
- Both get documented in `.env.example` and README → Deployment.

Referrers are already covered. `index.html` has `<meta name="referrer" content="no-referrer">`, which also applies under `vercel dev`, and `vercel.json` sends the matching header. So Cloudinary never learns which family's page a request came from.

### Front end

- **Note dialog.** Add an "Upload a video" button. It opens a file picker (`accept="video/*"`), and before anything uploads, the browser checks the file is at most 60 seconds (from its metadata) and at most 100MB. The review step plays the file with "Post" and "Choose another." "Post" gets a ticket, uploads with `XMLHttpRequest` so progress can be shown (`fetch` can't report upload progress), then attaches the note. A failure keeps the file and offers "Try again."
- **Card.** A 16:9 box with a thin frame in the note's color and a play button. The still uses `object-fit: contain` on the note's color, so an upright video gets colored sides with no dimensions stored. Below it is the color strip with the signature and time, as on a written note.
- **Playback.** Tapping the play button swaps the still for `<video controls autoplay playsInline>` in the same 16:9 box. Starting one video pauses any other video note that's playing.
- **Still processing.** If the still fails to load because Cloudinary is still converting, the card says "Video is processing. Check back in a minute."

## Steps

1. Install `cloudinary` and write `server/videos.ts`: the interface, the Cloudinary store, and the fake for tests. Check by hand, with your Cloudinary env in `.env`, that:
   - a signed upload lands as `authenticated` under the folder, and its original filename is `video`;
   - `describe` reports the duration, and returns null for an image uploaded with the same parameters;
   - the signed mp4 and still URLs play, and the unsigned URL is refused;
   - the derived mp4 has no location metadata, checked with `ffprobe` on a phone video that has location data;
   - after `destroy`, the signed URLs stop working.
2. Write the schema and migration (`Note.videoId`, `VideoUpload`, the check constraint), then confirm `prisma migrate diff` shows no drift.
3. Server: ticket issuing, attaching a video in `createNote`, video URLs in `noteView`, Cloudinary-first deletion in `deleteNote`, and the locked deletion in `deleteUpdate`.
4. Integration tests (below). Prove each access test can fail by removing its rule.
5. Handlers: the new `notes/video.ts`, plus passing the store to the notes, note, and update handlers.
6. Front end: the upload path in the note dialog, the video card, the playback dialog, and the processing fallback.
7. Typecheck, test, open the PR, seed the preview, and send you a test link.

## Tests

Integration tests run against Postgres with the fake store. Each one guards an access rule:

- **Tickets:**
  - only someone signed in, and not removed, gets one (handler-level 401 or 403);
  - the 21st ticket in an hour is refused.
- **Attaching:**
  - another person's ticket is refused, from the same family or another one, and the store is never called;
  - an unknown public ID is refused, and the store is never called;
  - someone in family A can't attach their own ticket's video to family B's update;
  - a ticket can't attach a second note;
  - a video that's missing, not authenticated, or longer than 61 seconds is refused;
  - a body and a video together are refused;
  - video notes count toward the shared 20-an-hour limit.
- **Viewing:**
  - another family never gets a video note or its URLs, on the wall or in the feed;
  - a removed author's video note yields no Cloudinary URL anywhere in the raw feed or wall JSON, and comes back on restore.
- **Deleting:**
  - a supporter who isn't the author can't delete a video note, and the store is never asked to destroy it;
  - another family's family member can't delete it either;
  - the author and any family member can, and destroy is called with video, authenticated, and invalidate;
  - if the store fails, the note stays;
  - deleting an update destroys the videos of all its notes, including a removed author's;
  - an attach that races an update's deletion either fails with 404 or has its video destroyed. The test holds the update lock deterministically (`queuedOrDone`).

There's no unit test for URL signing (it's the SDK's job). Step 1's manual check covers that the configuration is right.

## Discoveries

- **API key permissions.** Cloudinary API keys carry their own permissions. The first key could read and delete but not upload ("missing permissions (actions=[create])"). A key for this app needs to create, read, and delete.
- **Video length.** The Admin API's `resource` call reports a video's length only with `media_metadata: true`. Without it, `describe` found every video missing.
- **SDK usage parameter.** The SDK adds an `_a=` usage parameter to delivery links by default. Links are built with `urlAnalytics: false`, so it never reaches Cloudinary.
- **Checked against the real Cloudinary environment:**
  - uploads land as `authenticated`, and an upload sent through the browser keeps `video` as its original filename;
  - an image uploaded with the same signed parameters looks missing to `describe`;
  - re-uploading to an existing ID returns the original and doesn't overwrite it;
  - signed links play, an unsigned link gets 401, and the public `upload` form of the address gets 404;
  - the converted mp4 is h264 with no location atoms;
  - deleting a note in the UI removes its video from Cloudinary.
- **Deleted videos linger briefly.** Links to a deleted video keep playing until Cloudinary's CDN clears its cached copies. That took from under a minute to as long as 15 minutes, even with `invalidate: true`. The spec's Stated limits says links stop working "within minutes."

- **In-card playback.** The first build played videos in a dialog. On the preview, Melissa asked for them to play inside the card instead, and the spec changed with it.

## Cut for speed

- **Orphaned uploads.** Some videos sit in Cloudinary unattached: an upload refused for being too long, or one whose attach failed or whose tab closed mid-post. No link to them is ever handed out. A sweep script, which destroys ticketed videos with no note after a day, goes in `NEXT-SESSION.md`.
- **No processing notification.** Cloudinary can call back when conversion finishes, but that's another public endpoint with signature checks. The card's "processing" fallback covers the gap.
- **Shared Cloudinary environment.** You accepted that the key in Vercel can reach your other projects' assets. They're inactive today. Moving this app to its own environment goes in `NEXT-SESSION.md`.
- **No server-side size cap.** Signed uploads can't limit file size, so the browser checks for 100MB and Cloudinary's own plan limit backs that up.
- **Credit usage.** The free plan's credits cover storage, bandwidth, and conversions together. A backlog entry will remind us to check usage after launch week.
