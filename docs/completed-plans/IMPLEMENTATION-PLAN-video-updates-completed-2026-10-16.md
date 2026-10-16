# Implementation Plan — Video updates

A family member can post an update that is a video, using the same recorder, review, and upload as a video note. A video update has no text, no photos, and no time limit. It is still at most 100 MB. It can't be edited. Deleting it deletes the video from Cloudinary first.

## Where it shows

The post card has two tabs, Write and Video, starting on Write. Write is the editor that is there today. Video is the shared recorder: start, countdown, record until Stop, review, re-record, and upload instead. The recorder has no note color here; the frame and buttons are the usual ones. While recording, it shows how long it has run, not time remaining. It stops if the recording reaches 100 MB, and that recording can still be posted. The notify checkbox applies to either tab.

In the feed, a video update shows the same player as a video note, without a note color. Starting any video pauses any other. There is no Edit button. Delete stays. The wall's filter bar quotes `[Video]`, because that is the update's stored plain text.

The notification subject says "(video)". The email does not link the video.

## How it's stored

`Update.videoId` is an optional unique Cloudinary public ID. A video update has that id, `content` null, and `body` `[Video]`. A check constraint keeps a video update from also having a document. Text updates are unchanged.

Uploads reuse the note ticket: the same endpoint, the same 20 tickets an hour, and the same rule that only the person the ticket was issued to can attach it. Attaching locks the ticket and refuses it if it is already on a note or an update. Notes still refuse a video over 60 seconds. An update refuses a video over 100 MB, read from the host after upload, and does not look at the length. A video that isn't there is refused, and a refused video is left in place.

The feed builds signed links only while listing that family's updates, the same way it does for a video note. If the host can't make the links, that video says it can't be shown and the rest of the feed still loads.

Deleting an update destroys its own video and its notes' videos before the row is removed. If the host can't delete one, the update stays.

A supporter, a removed family member, and another family's member can't post one. Another family's feed never includes the links.

## Sharing the recorder

`VideoRecorder` takes an optional note color and a maximum length. Notes pass the color and 60 seconds. Updates pass neither. The review, upload, and player move into `src/components/video.tsx`, and the note dialog uses them.

## Tests

Integration tests, against Postgres:

- A family member posts a video far longer than a minute. The row has the video id, body `[Video]`, and no content. The family's feed, including a supporter's, returns signed links. Another family's feed does not contain the id or the link.
- A supporter can't post one, and the host is not asked. Another person's ticket is refused without asking the host. A removed family member can't post one.
- A ticket already on a note can't be posted as an update, and a ticket already on an update can't be left as a note. A second attach of the same ticket is refused. The video stays.
- A video over 100 MB is refused and left in place. One of exactly 100 MB, of any length, is accepted. A video that never uploaded is refused.
- Text and a video together are refused.
- Editing a video update is refused, and the row is unchanged.
- Deleting destroys the video first. If the host can't delete it, the update remains. A later delete removes it.
- The notification subject is "(video)", and the email doesn't contain the video's id or address. If the emails fail, the update stays.
- A misconfigured host marks the video unavailable and still returns the feed, and refuses a new one with no row saved.

No UI tests. Check by hand: the tabs, a recording through post, upload instead, a file over 100 MB, the player beside a video note (starting one pauses the other), no Edit, delete, and the email subject. The browser pane can't use the camera, so the live recording is checked in a real browser.

## Cut for speed

No caption. No way to replace the video without deleting the update. The 100 MB limit stays; lifting it is a Cloudinary cost, not a small change. Abandoned uploads are the existing sweep on the backlog.
