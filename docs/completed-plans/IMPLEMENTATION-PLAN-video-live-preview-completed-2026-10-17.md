# Implementation plan: live camera preview in the recorder

Spec: `spec/updates.md` → "Video updates" and "Video notes" (Recording, Reviewing).

The recorder turns the camera on as soon as its tab opens. It shows the live, mirrored preview, with its one control (Start recording, Cancel countdown, or Stop) over the bottom of the camera view. Both recorders get this, the post form's Video tab and the note dialog's "Video note" tab, because they share `VideoRecorder`.

## Changes

All in `src/components/recorder.tsx`. `VideoCapture` (`src/components/video.tsx`) needs no change: it mounts the recorder only while no video is chosen, so opening the tab and pressing Re-record both mount it fresh, and that now starts the camera.

1. **Start the camera on mount.** The mount effect calls `getUserMedia` itself when the browser can record, and otherwise reports it can't, as it does today. The `"idle"` phase goes away: the recorder starts in `"starting"`, then moves to `"ready"` once the stream arrives, instead of going straight to the countdown. Refusals still go to `onUnavailable(cameraProblem(err))`.
2. **Never leak a stream after unmount.** The effect gets its own `cancelled` flag in place of the shared `mounted` ref for this call. `main.tsx` uses `StrictMode`, which mounts, unmounts, and remounts in development. With a shared ref, the first mount's stream would arrive after the remount had set `mounted` back to true, so it would never be stopped and the camera light would stay on. The countdown, recording, and `onstop` paths keep `mounted` as they are.
3. **"Waiting for camera access…"** replaces "Starting your camera…" while the phase is `"starting"`.
4. **Overlay the controls.** One absolutely positioned bar at the bottom center of the frame shows the phase's button: Start recording (ready), Cancel countdown (countdown, returning to ready), and Stop (recording). The buttons below the frame go away. Colors are unchanged: inked for a note, default otherwise. Cancel stays `outline` and Stop stays `destructive`; both have solid backgrounds that read over video.
5. **Update the component's header comment** to match.

## Tests

None new. Nothing here changes who can see or do what, and `src/recorder.ts`'s pure logic is untouched. Run `npm run typecheck` and `npm test`.

Browser checks in the pane, which blocks the camera: opening each tab shows the refused-camera message and the upload button, and switching tabs doesn't break the page. Melissa checks the live camera in her own browser, ideally on a phone too: the permission prompt on opening the tab, the preview, Start/Cancel/Stop in place, Re-record returning to the preview, and the camera light going off when she switches tabs or closes the dialog.

## Cut for speed

- No automated test for the camera starting and stopping. It needs a real or faked `getUserMedia`, and the leak in step 2 only shows up as the camera light staying on.

## Results

- Typecheck and all 354 tests pass locally. CI passes.
- On the preview, in the browser pane, which blocks the camera: opening the post form's Video tab shows "Waiting for camera access…" at once, then the camera message and "Upload a video". Opening the note dialog's "Video note" tab does the same.
- Change made while building: a recording that produced no data used to stop the camera and return to the button. Now it keeps the camera on and returns to the live preview, since there's no longer a button that would turn the camera back on.
- Melissa's check in Chrome found slivers at the sides of the live view: the frame's 4px border made the view inside it narrower than 16:9. The frame is now padding around an exactly 16:9 view.
