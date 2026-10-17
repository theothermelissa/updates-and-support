import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { PALETTE, type NoteColor } from "../notes.js";
import {
  cameraProblem,
  elapsedTime,
  recordingName,
  recordingType,
  timeLeft,
  VIDEO_BITS_PER_SECOND,
} from "../recorder.js";
import { MAX_BYTES } from "../videos.js";

const CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: true,
};

// Turns the camera on as soon as it appears, which asks for permission the first time, and
// shows the live camera, mirrored like a selfie, with "Start recording" over its bottom edge.
// That starts a 3-2-1 countdown, then recording with Stop in the same place. With a max length it shows the time left and stops at that length; without one
// it shows how long it has run and stops only at Stop, at 100 MB, or when the page is hidden.
// Hands the recording over as a file and turns the camera off; unmounting turns it off too
// and discards anything recording. If the camera can't start, reports why instead. A note
// color paints the frame and buttons; without one they use the usual styles.
export function VideoRecorder(props: {
  color?: NoteColor;
  maxSeconds: number | null;
  onRecorded: (file: File) => void;
  onUnavailable: (message: string) => void;
  onRejected?: (message: string) => void;
  onSizeLimit?: () => void;
}) {
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [phase, setPhase] = useState<"starting" | "ready" | "countdown" | "recording">("starting");
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const colors = props.color ? PALETTE[props.color] : null;
  // Buttons in the note's darker color rather than the usual black.
  const inked = colors ? { backgroundColor: colors.text, color: "white" } : undefined;

  // The latest callbacks, so the effects below run once rather than on every render.
  const callbacks = useRef(props);
  callbacks.current = props;
  const maxSeconds = useRef(props.maxSeconds);
  maxSeconds.current = props.maxSeconds;

  const mounted = useRef(true);

  // Turns the camera on, or says at once that this browser can't record.
  useEffect(() => {
    mounted.current = true;
    // Its own flag rather than `mounted`: StrictMode remounts at once, which would set
    // `mounted` back to true before the first mount's stream arrived and leak that stream.
    let cancelled = false;
    const type = typeof MediaRecorder === "undefined" ? null : recordingType((t) => MediaRecorder.isTypeSupported(t));
    if (!navigator.mediaDevices?.getUserMedia || !type) {
      callbacks.current.onUnavailable(cameraProblem(undefined));
    } else {
      navigator.mediaDevices.getUserMedia(CONSTRAINTS).then(
        (s) => {
          if (cancelled) return stopTracks(s);
          stream.current = s;
          if (live.current) live.current.srcObject = s;
          setPhase("ready");
        },
        (err) => !cancelled && callbacks.current.onUnavailable(cameraProblem(err)),
      );
    }
    return () => {
      cancelled = true;
      mounted.current = false;
      // Discards a recording in progress: the dialog closed or switched away.
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state !== "inactive") recorder.current.stop();
      }
      stopTracks(stream.current);
    };
  }, []);

  // 3, 2, 1, then record.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) return start();
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, count]);

  // While recording: the time left, a stop at the limit, and a stop if the page is hidden,
  // since phones suspend the camera in the background.
  useEffect(() => {
    if (phase !== "recording") return;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const ms = performance.now() - startedAt;
      setElapsed(ms);
      const cap = maxSeconds.current;
      if (cap !== null && ms >= cap * 1000) stop();
    }, 250);
    const hidden = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [phase]);

  function start() {
    const type = recordingType((t) => MediaRecorder.isTypeSupported(t))!;
    const chunks: Blob[] = [];
    let bytes = 0;
    let hitSize = false;
    const rec = new MediaRecorder(stream.current!, { mimeType: type, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
    rec.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      // Drop the chunk that would pass 100 MB, so the recording can still be posted.
      if (bytes + e.data.size > MAX_BYTES) {
        hitSize = true;
        if (rec.state === "recording") rec.stop();
        return;
      }
      bytes += e.data.size;
      chunks.push(e.data);
    };
    rec.onstop = () => {
      // Nothing usable: keep the camera on for another try.
      if (chunks.length === 0) {
        if (mounted.current) setPhase("ready");
        callbacks.current.onRejected?.("That video is too large. Please choose one under 100 MB.");
        return;
      }
      stopTracks(stream.current);
      const fileType = type.split(";")[0]!;
      if (hitSize) callbacks.current.onSizeLimit?.();
      callbacks.current.onRecorded(new File(chunks, recordingName(type), { type: fileType }));
    };
    recorder.current = rec;
    rec.start(1000);
    setElapsed(0);
    setPhase("recording");
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return (
    <div className="grid gap-2">
      {/* The frame is padding around the view rather than a border, so the view itself is
          exactly 16:9 and a 16:9 camera fills it with no slivers at the sides. */}
      <div className={cn("rounded-xl p-1", !colors && "bg-border")} style={colors ? { backgroundColor: colors.fill } : undefined}>
        <div
          className={cn("relative aspect-[3/4] w-full overflow-hidden rounded-lg sm:aspect-video", !colors && "bg-muted")}
          style={colors ? { backgroundColor: colors.fill } : undefined}
        >
          <video
            ref={live}
            autoPlay
            muted
            playsInline
            className="size-full -scale-x-100 object-contain"
            aria-label="Your camera"
          />
          {phase === "starting" && (
            <p
              className={cn("absolute inset-0 flex items-center justify-center p-4 text-sm", !colors && "text-muted-foreground")}
              style={colors ? { color: colors.text } : undefined}
            >
              Waiting for camera access…
            </p>
          )}
          {phase === "countdown" && (
            <span
              className="absolute inset-0 flex items-center justify-center text-8xl font-semibold text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.6)]"
              aria-live="assertive"
            >
              {count}
            </span>
          )}
          {phase === "recording" && (
            <span
              className="absolute top-2 left-2 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white"
              role="timer"
            >
              <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
              {props.maxSeconds === null ? elapsedTime(elapsed) : timeLeft(elapsed, props.maxSeconds)}
            </span>
          )}
          {/* One control at a time, in the same place, so a thumb never has to move. */}
          <span className="absolute inset-x-0 bottom-3 flex justify-center px-3">
            {phase === "ready" && (
              <Button
                type="button"
                className="hover:opacity-90"
                style={inked}
                onClick={() => {
                  setCount(3);
                  setPhase("countdown");
                }}
              >
                Start recording
              </Button>
            )}
            {phase === "countdown" && (
              <Button type="button" variant="outline" onClick={() => setPhase("ready")}>
                Cancel countdown
              </Button>
            )}
            {phase === "recording" && (
              <Button type="button" variant="destructive" onClick={stop}>
                Stop
              </Button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function stopTracks(s: MediaStream | null) {
  s?.getTracks().forEach((track) => track.stop());
}
