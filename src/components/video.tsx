import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { VideoRecorder } from "@/components/recorder";
import { PALETTE, type NoteColor } from "../notes.js";
import { checkVideo } from "../videos.js";

// A blurred, enlarged copy of a video's still that fills its box behind the video, so a
// video of another shape has no empty bars. Enlarged so the blur's soft edges fall outside
// the box. A video source shows its frame at the given time, for a video not yet uploaded.
function BlurredBackdrop({ src, video }: { src: string; video?: boolean }) {
  const className = "pointer-events-none absolute inset-0 size-full scale-125 object-cover blur-[26px] brightness-90";
  return video ? (
    <video src={src} muted playsInline preload="auto" aria-hidden className={className} />
  ) : (
    <img src={src} alt="" aria-hidden className={className} />
  );
}

export type Playable = { src: string; poster: string } | { unavailable: true };

// The video's still in a 16:9 box, shown whole over a blurred, enlarged copy of itself,
// with a play button. The video plays in the same box over the same blurred still, and
// starting it pauses any other video that's playing. Until the host has converted the
// video, the still doesn't load and the box says so; when the server couldn't make its
// links, the box says that instead. A note color fills the box; an update leaves it plain.
export function VideoPlayer(props: { video: Playable; kind: "note" | "update"; authorName: string; fill?: string }) {
  const [playing, setPlaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const noun = props.kind === "note" ? "video note" : "video";
  const playLabel = `Play ${noun} from ${props.authorName}`;
  const videoLabel = props.kind === "note" ? `Video note from ${props.authorName}` : `Video from ${props.authorName}`;
  const box = "relative block aspect-video w-full overflow-hidden rounded-lg";
  const fill = props.fill ? { backgroundColor: props.fill } : undefined;

  if ("unavailable" in props.video) {
    return (
      <p className={cn(box, "flex items-center justify-center p-4 text-sm", !props.fill && "bg-muted text-muted-foreground")} style={fill}>
        This video can't be shown right now.
      </p>
    );
  }

  if (playing) {
    return (
      <div className={cn(box, !props.fill && "bg-muted")} style={fill}>
        <BlurredBackdrop src={props.video.poster} />
        <video
          src={props.video.src}
          poster={props.video.poster}
          controls
          autoPlay
          playsInline
          data-video
          className="relative size-full object-contain"
          aria-label={videoLabel}
          onPlay={(e) => {
            for (const other of document.querySelectorAll<HTMLVideoElement>("video[data-video]")) {
              if (other !== e.currentTarget) other.pause();
            }
          }}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn(box, "outline-none focus-visible:ring-3 focus-visible:ring-ring/50", !props.fill && "bg-muted")}
      style={fill}
      onClick={() => setPlaying(true)}
      disabled={processing}
      aria-label={playLabel}
    >
      {processing ? (
        <span className="flex h-full items-center justify-center p-4 text-sm">Video is processing. Check back in a minute.</span>
      ) : (
        <>
          <BlurredBackdrop src={props.video.poster} />
          <img
            src={props.video.poster}
            alt=""
            className="relative size-full object-contain"
            onError={() => setProcessing(true)}
            loading="lazy"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white">
              <PlayIcon className="ml-0.5 size-7 fill-current" />
            </span>
          </span>
        </>
      )}
    </button>
  );
}

// The recorder, or the upload picker when the camera can't be used, then the chosen video
// playing back for review. Nothing uploads until the caller posts. A note passes its color
// and a 60-second limit; an update passes neither.
export function VideoCapture(props: {
  color?: NoteColor;
  maxSeconds: number | null;
  disabled: boolean;
  video: { file: File; recorded: boolean } | null;
  onVideo: (video: { file: File; recorded: boolean } | null) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const colors = props.color ? PALETTE[props.color] : null;
  const file = props.video?.file;

  useEffect(() => {
    if (!file) return setUrl(null);
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  async function picked(chosen: File | undefined) {
    if (input.current) input.current.value = "";
    if (!chosen) return;
    props.onError("");
    setNotice("");
    const problem = await checkVideo(chosen, props.maxSeconds);
    if (problem) props.onError(problem);
    else props.onVideo({ file: chosen, recorded: false });
  }

  const upload = (label: string, variant: "outline" | "ghost" = "outline") => (
    <Button type="button" variant={variant} onClick={() => input.current?.click()} disabled={props.disabled}>
      {label}
    </Button>
  );

  const frame = cn("relative aspect-video w-full overflow-hidden rounded-xl border-4", !colors && "border-border bg-muted");
  const frameStyle = colors ? { backgroundColor: colors.fill, borderColor: colors.fill } : undefined;

  return (
    <div className="grid gap-2">
      <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => picked(e.target.files?.[0])} />
      {props.video && url ? (
        <>
          <div className={frame} style={frameStyle}>
            <BlurredBackdrop src={`${url}#t=0.1`} video />
            <video
              src={url}
              controls
              playsInline
              autoPlay={props.video.recorded}
              data-video
              className="relative size-full object-contain"
              aria-label="Your video"
              onPlay={(e) => {
                for (const other of document.querySelectorAll<HTMLVideoElement>("video[data-video]")) {
                  if (other !== e.currentTarget) other.pause();
                }
              }}
            />
          </div>
          {props.video.recorded ? (
            <Button
              type="button"
              className={colors ? "hover:opacity-90" : undefined}
              style={colors ? { backgroundColor: colors.text, color: "white" } : undefined}
              onClick={() => {
                setNotice("");
                props.onVideo(null);
              }}
              disabled={props.disabled}
            >
              Re-record
            </Button>
          ) : (
            upload("Choose another")
          )}
        </>
      ) : props.video ? (
        // The preview URL arrives on the next render. Hold the frame so the camera
        // button doesn't flash when this view remounts with a video already chosen.
        <div className={frame} style={frameStyle} />
      ) : cameraProblem ? (
        <>
          <p
            className={cn("rounded-xl border p-4 text-sm", !colors && "bg-muted text-foreground")}
            style={colors ? { backgroundColor: colors.fill, color: colors.text, borderColor: `${colors.text}33` } : undefined}
          >
            {cameraProblem}
          </p>
          {upload("Upload a video")}
        </>
      ) : (
        <>
          <VideoRecorder
            color={props.color}
            maxSeconds={props.maxSeconds}
            onRecorded={(recorded) => props.onVideo({ file: recorded, recorded: true })}
            onUnavailable={setCameraProblem}
            onRejected={props.onError}
            onSizeLimit={() => setNotice("Recording stopped at 100 MB. You can post this or re-record.")}
          />
          {upload("Upload a video instead", "ghost")}
        </>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    </div>
  );
}
