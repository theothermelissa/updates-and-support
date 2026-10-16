# Implementation Plan: Video notes, part 2 (the recorder)

Spec: [updates.md → Video notes](spec/updates.md#video-notes), the "Recording," "Reviewing," and "Uploading instead" paragraphs. The spec needs no changes.

Storage, access, upload, and the video card shipped in part 1. This plan adds recording in the page. It changes only the front end: the recorder produces a video file and hands it to the review and upload path that already exists. There are no new endpoints, data, or permission rules, so no access review is needed.

## How it works

### The dialog's video side

"Leave a note" opens on the text box, as it does today. The button under the text box changes from "Send a video instead" to **"Record a video,"** as the spec says. The video side has three states, in `NoteForm`:

1. **Recorder:** the live camera and its controls (below). It also has an "Upload a video" button, which opens the file picker as today.
2. **Review:** a recorded or uploaded file, playing back in the 16:9 box on the note's color, with **"Post."**
   - A recording gets **"Re-record,"** which discards it and goes back to the recorder.
   - An upload keeps **"Choose another."**
   - Posting, progress, "Try again," and the reused upload on retry all work as they do today.
3. **Camera unavailable:** the recorder couldn't start the camera. It says why and offers only "Upload a video."

"Write a note instead" and "Cancel" work from any state, and leaving the recorder turns the camera off.

### The recorder

The recorder is a `VideoRecorder` component in `src/components/recorder.tsx`, with its browser-independent decisions in `src/recorder.ts`.

- **Camera.** It calls `getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })` when the recorder opens. Tapping "Record a video" counts as the tap that iOS requires before camera access. The live view is a muted `<video playsInline autoPlay>`, mirrored with `scale-x-[-1]`.
- **The camera is on only while it's needed.** The recorder stops every track when it hands over a recording, when the dialog closes or switches to writing, and when the component unmounts. So the camera light is off during review, and "Re-record" asks for the camera again. That second request doesn't prompt, because permission was already granted.
- **Format.** `recordingType()` picks the first type `MediaRecorder.isTypeSupported` accepts: `video/mp4`, then `video/webm;codecs=vp9,opus`, then `video/webm`.
  - Safari and recent Chrome record mp4. Firefox records webm.
  - Cloudinary converts any of them to mp4 for playback.
  - `videoBitsPerSecond: 2_500_000` keeps a full minute near 20MB.
- **Countdown.** "Start recording" shows 3, 2, 1, one second each, in large type over the live view, then starts the `MediaRecorder`. During the countdown the button becomes "Cancel countdown," which goes back to the live view.
- **Recording.** The recorder shows the time left out of 60 seconds ("0:42 left") and a "Stop" button. A 250ms timer measures elapsed time from the start time, so a slow tick can't stretch the limit. Recording stops at 60 seconds or at "Stop."
- **Leaving the page stops recording.** If the page is hidden mid-recording (another tab, the phone locked, or a call), the recorder stops and goes to review with what it has. iOS suspends the camera in the background, and the recording would otherwise end in silence.
- **Handover.** On stop, the chunks become a `File` named `video.mp4` or `video.webm`, and the form goes to review. Recordings skip the length check in `checkVideo`: they can't exceed 60 seconds, and their metadata often reports no length. The server checks the length after upload either way.
- **Camera problems.** `cameraProblem(error)` maps the browser's error to a sentence:
  - `NotAllowedError`: "Camera access is turned off for this site. You can allow it in your browser's settings, or upload a video instead."
  - `NotFoundError` or `OverconstrainedError`: "No camera was found on this device."
  - `NotReadableError`: "Your camera is being used by another app."
  - no `navigator.mediaDevices` or no `MediaRecorder`, as in some email apps' built-in browsers and on old browsers: "This browser can't record video here. Try opening the page in Safari or Chrome, or upload a video instead."
  - anything else: "Your camera couldn't be started."

## Steps

1. `src/recorder.ts`, with `recordingType` and `cameraProblem` and their unit tests.
2. `src/components/recorder.tsx`, with the live view, countdown, recording timer, stop, page-hidden stop, and camera cleanup.
3. `NoteForm`: the "Record a video" entry, the three video states, review with "Re-record" or "Choose another," and camera cleanup when switching away.
4. Check it in the browser pane. The pane has no camera, so this covers the unavailable state, uploading, and that writing and posting still work. To exercise the recording states without a camera, a temporary `getUserMedia` stand-in in the console can feed a canvas stream, the way part 1 generated test clips.
5. Typecheck, test, open the PR, seed the preview, and send you the link. **You'll need to test on real devices:** iPhone Safari, an Android phone if you have one, and a desktop browser. Watch for the camera prompt, the mirrored view, the countdown, auto-stop at 60 seconds, re-record, and posting.

## Tests

Unit tests in `src/recorder.test.ts`:

- `recordingType` prefers mp4, falls back to webm, and returns null when nothing is supported.
- `cameraProblem` maps each error name to its sentence, and also handles a missing `mediaDevices` and an unknown error.

The rest is UI and timing, which the project's testing rules leave to hand and browser checks. Nothing here changes who can see or do what.

## Cut for speed

- **Front camera only.** There's no switch to the back camera.
- **No pause or resume while recording.** "Stop" ends the recording.
- **No microphone level meter, and no check that the microphone is working.** Someone with a muted microphone finds out at review.
- **No warning before posting a recording with silent audio.**

## Discoveries

- **What the browser pane covered.** The pane blocks the camera, so it showed the camera-unavailable state for real: the reason, and only "Upload a video." A canvas stream standing in for `getUserMedia` then exercised every recording state:
  - the mirrored live view;
  - the countdown, then recording with the time left;
  - Stop;
  - review that plays back unmirrored, with the camera tracks ended;
  - Re-record back to the live view;
  - Post, after which the recorded mp4 played in its card.

  React's development double mount opens the camera twice; the first stream is stopped by the cleanup.
- **"Cancel countdown."** During the countdown, a plain "Cancel" sat beside the dialog's own "Cancel," so the countdown's button says "Cancel countdown."
- **A malformed `CLOUDINARY_URL` took down the whole feed.** On the preview, a Preview value that didn't start with `cloudinary://` made the Cloudinary SDK throw as it loaded. That crashed the updates function for every family, video or not. The SDK now loads behind a guard in `server/videos.ts`, so a bad value breaks only video calls. A video note whose links can't be made comes back as `unavailable`, and its card says "This video can't be shown right now." An integration test covers the feed and the wall with failing links, and fails without the guard.
