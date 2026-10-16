import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PALETTE, type NoteColor } from "../notes.js";
import {
  cameraProblem,
  MAX_RECORDING_SECONDS,
  recordingName,
  recordingType,
  timeLeft,
  VIDEO_BITS_PER_SECOND,
} from "../recorder.js";

const CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: true,
};

// A "Start recording" button that turns on the camera, which asks for permission the first
// time, then the live camera, mirrored like a selfie, with a 3-2-1 countdown, then up to a
// minute of recording with the time left and Stop. Hands the recording over as a file and
// turns the camera off; unmounting turns it off too and discards anything recording. If the
// camera can't start, reports why instead.
export function VideoRecorder(props: {
  color: NoteColor;
  onRecorded: (file: File) => void;
  onUnavailable: (message: string) => void;
}) {
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [phase, setPhase] = useState<"idle" | "starting" | "ready" | "countdown" | "recording">("idle");
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const colors = PALETTE[props.color];

  // The latest callbacks, so the effects below run once rather than on every render.
  const callbacks = useRef(props);
  callbacks.current = props;

  const mounted = useRef(true);

  // A browser that can't record says so at once, before anyone presses the button.
  useEffect(() => {
    mounted.current = true;
    const type = typeof MediaRecorder === "undefined" ? null : recordingType((t) => MediaRecorder.isTypeSupported(t));
    if (!navigator.mediaDevices?.getUserMedia || !type) callbacks.current.onUnavailable(cameraProblem(undefined));
    return () => {
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
      if (ms >= MAX_RECORDING_SECONDS * 1000) stop();
    }, 250);
    const hidden = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [phase]);

  // Turns the camera on, then goes straight into the countdown.
  function open() {
    setPhase("starting");
    navigator.mediaDevices.getUserMedia(CONSTRAINTS).then(
      (s) => {
        if (!mounted.current) return stopTracks(s);
        stream.current = s;
        if (live.current) live.current.srcObject = s;
        setCount(3);
        setPhase("countdown");
      },
      (err) => mounted.current && callbacks.current.onUnavailable(cameraProblem(err)),
    );
  }

  function start() {
    const type = recordingType((t) => MediaRecorder.isTypeSupported(t))!;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current!, { mimeType: type, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stopTracks(stream.current);
      const fileType = type.split(";")[0]!;
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
      <div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border-4 sm:aspect-video"
        style={{ backgroundColor: colors.fill, borderColor: colors.fill }}
      >
        <video
          ref={live}
          autoPlay
          muted
          playsInline
          className="size-full -scale-x-100 object-contain"
          aria-label="Your camera"
        />
        {phase === "idle" && (
          <span className="absolute inset-0 flex items-center justify-center p-4">
            <Button type="button" onClick={open}>
              Start recording
            </Button>
          </span>
        )}
        {phase === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-sm" style={{ color: colors.text }}>
            Starting your camera…
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
            {timeLeft(elapsed)}
          </span>
        )}
      </div>
      {phase === "ready" && (
        <Button
          type="button"
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
    </div>
  );
}

function stopTracks(s: MediaStream | null) {
  s?.getTracks().forEach((track) => track.stop());
}
