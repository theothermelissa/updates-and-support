import { useEffect, useRef, useState, type FormEvent } from "react";
import { PlayIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "cn";
import { Confirm, ErrorMessage, Field, LinkedText } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COLORS, MAX_NOTE, PALETTE, randomColor, type Note, type NoteColor } from "../notes.js";
import { checkVideo, uploadVideo } from "../videos.js";
import { VideoRecorder } from "@/components/recorder";

// A note as a card in its color, signed by its author, with Delete for those allowed. A video
// note's card is the video's still, edge to edge inside a thin frame in the note's color.
export function NoteCard(props: { note: Note; canDelete: boolean; onDelete: () => Promise<boolean> }) {
  const { note } = props;
  const [confirming, setConfirming] = useState(false);
  const colors = PALETTE[note.color];
  return (
    <article
      className={cn("break-inside-avoid rounded-xl border text-base", note.video ? "space-y-2 p-1.5 pb-4" : "space-y-3 p-4")}
      style={{ backgroundColor: colors.fill, color: colors.text, borderColor: `${colors.text}33` }}
    >
      {note.video ? (
        <VideoStill note={note} video={note.video} />
      ) : (
        <LinkedText text={note.body} className="font-medium [&_a]:text-inherit" />
      )}
      <div className={cn("space-y-3", note.video && "px-2.5")}>
        <p className="text-sm">
          — {note.authorName}
          {note.authorIsFamily && (
            <span className="ml-2 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: `${colors.text}66` }}>
              Family
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
          <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
          {props.canDelete && !confirming && (
            <button className="underline underline-offset-2" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
        {confirming && (
          <div className="text-foreground">
            <Confirm yes="Yes, delete" onYes={props.onDelete} onCancel={() => setConfirming(false)}>
              Delete this note? This can't be undone.
            </Confirm>
          </div>
        )}
      </div>
    </article>
  );
}

// The video's still in a 16:9 box, shown whole on the note's color, with a play button. The
// video plays in the same box, and starting it pauses any other video note that's playing.
// Until the host has converted the video, the still doesn't load and the box says so; when
// the server couldn't make its links, the box says that instead.
function VideoStill({ note, video }: { note: Note; video: NonNullable<Note["video"]> }) {
  const [playing, setPlaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const colors = PALETTE[note.color];
  const box = "relative block aspect-video w-full overflow-hidden rounded-lg";

  if ("unavailable" in video) {
    return (
      <p className={cn(box, "flex items-center justify-center p-4 text-sm")} style={{ backgroundColor: colors.fill }}>
        This video can't be shown right now.
      </p>
    );
  }

  if (playing) {
    return (
      <video
        src={video.src}
        poster={video.poster}
        controls
        autoPlay
        playsInline
        data-video-note
        className={cn(box, "object-contain")}
        style={{ backgroundColor: colors.fill }}
        aria-label={`Video note from ${note.authorName}`}
        onPlay={(e) => {
          for (const other of document.querySelectorAll<HTMLVideoElement>("video[data-video-note]")) {
            if (other !== e.currentTarget) other.pause();
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={cn(box, "outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
      style={{ backgroundColor: colors.fill }}
      onClick={() => setPlaying(true)}
      disabled={processing}
      aria-label={`Play video note from ${note.authorName}`}
    >
      {processing ? (
        <span className="flex h-full items-center justify-center p-4 text-sm">
          Video is processing. Check back in a minute.
        </span>
      ) : (
        <>
          <img
            src={video.poster}
            alt=""
            className="size-full object-contain"
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

// What the dialog leaves: a written note's body, or a posted video's public ID.
export type NoteDraft = { body?: string; video?: string; color: NoteColor; name?: string };

// The "Leave a note" dialog. Starts in a random color. Shows the viewer's name read-only, or
// asks for one from someone without it; a name is changed on their profile, never here.
// `onLeave` returns an error message, or null once the note is saved.
export function NoteDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  name: string | null;
  onLeave: (draft: NoteDraft) => Promise<string | null>;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounted each time it opens, so every note starts empty in a fresh random color. */}
        {props.open && <NoteForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function NoteForm(props: {
  slug: string;
  name: string | null;
  onOpenChange: (open: boolean) => void;
  onLeave: (draft: NoteDraft) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<"write" | "video">("write");
  const [body, setBody] = useState("");
  // A recorded or uploaded video under review. A recording can be re-recorded.
  const [video, setVideo] = useState<{ file: File; recorded: boolean } | null>(null);
  const file = video?.file ?? null;
  // Once uploaded, a retry after a failed post reuses the video rather than uploading it again.
  const [uploaded, setUploaded] = useState<{ file: File; publicId: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [color, setColor] = useState<NoteColor>(() => randomColor());
  const [name, setName] = useState("");
  // Fixed when the dialog opens, so the field doesn't change once a new name is saved.
  const [askName] = useState(props.name === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const colors = PALETTE[color];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const named = askName ? { name } : {};
    let failed: string | null;
    if (mode === "write") {
      failed = await props.onLeave({ body, color, ...named });
    } else {
      failed = await postVideo(named);
    }
    setBusy(false);
    setProgress(null);
    if (failed) setError(failed);
    else props.onOpenChange(false);
  }

  async function postVideo(named: { name?: string }): Promise<string | null> {
    if (!file) return "Choose a video first.";
    let publicId = uploaded?.file === file ? uploaded.publicId : null;
    if (!publicId) {
      try {
        setProgress(0);
        publicId = await uploadVideo(props.slug, file, setProgress);
        setUploaded({ file, publicId });
      } catch (err) {
        return (err as Error).message;
      }
    }
    setProgress(1);
    return props.onLeave({ video: publicId, color, ...named });
  }

  const ready = mode === "write" ? body.trim() !== "" : file !== null;
  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Leave a note</DialogTitle>
        <DialogDescription>Everyone who reads these updates will see it, signed with your name.</DialogDescription>
      </DialogHeader>
      {mode === "write" ? (
        <>
          <textarea
            className="min-h-36 w-full rounded-xl border p-4 text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            style={{ backgroundColor: colors.fill, color: colors.text, borderColor: `${colors.text}33` }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX_NOTE}
            aria-label="Your note"
            placeholder="Write your note…"
            autoFocus
            required
          />
          <Button type="button" variant="outline" onClick={() => setMode("video")}>
            Record a video
          </Button>
        </>
      ) : (
        <>
          <VideoSide video={video} color={color} disabled={busy} onVideo={setVideo} onError={setError} />
          <Button type="button" variant="outline" onClick={() => setMode("write")} disabled={busy}>
            Write a note instead
          </Button>
        </>
      )}
      <RadioGroupPrimitive.Root
        className="flex flex-wrap gap-2"
        value={color}
        onValueChange={(v) => setColor(v as NoteColor)}
        aria-label="Note color"
      >
        {COLORS.map((c) => (
          <RadioGroupPrimitive.Item
            key={c}
            value={c}
            aria-label={PALETTE[c].name}
            className={cn(
              "size-11 rounded-full border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              c === color ? "border-foreground" : "border-transparent",
            )}
            style={{ backgroundColor: PALETTE[c].fill, boxShadow: `inset 0 0 0 1px ${PALETTE[c].text}55` }}
          />
        ))}
      </RadioGroupPrimitive.Root>
      <Field label="Your name">
        {askName ? (
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        ) : (
          <Input value={props.name ?? ""} readOnly className="bg-muted text-muted-foreground" />
        )}
      </Field>
      {progress !== null && (
        <p className="text-sm text-muted-foreground" role="status">
          {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : "Posting…"}
        </p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={busy || !ready || (askName && !name.trim())}>
          {mode === "write" ? "Leave note" : error ? "Try again" : "Post"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// The dialog's video side: the recorder, or the upload picker when the camera can't be used,
// then the chosen video playing back for review, shown whole on the note's color. Nothing
// uploads until the note is posted.
function VideoSide(props: {
  video: { file: File; recorded: boolean } | null;
  color: NoteColor;
  disabled: boolean;
  onVideo: (video: { file: File; recorded: boolean } | null) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const colors = PALETTE[props.color];
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
    const problem = await checkVideo(chosen);
    if (problem) props.onError(problem);
    else props.onVideo({ file: chosen, recorded: false });
  }

  const upload = (label: string, variant: "outline" | "ghost" = "outline") => (
    <Button type="button" variant={variant} onClick={() => input.current?.click()} disabled={props.disabled}>
      {label}
    </Button>
  );

  return (
    <div className="grid gap-2">
      <input
        ref={input}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => picked(e.target.files?.[0])}
      />
      {props.video && url ? (
        <>
          <video
            src={url}
            controls
            playsInline
            autoPlay={props.video.recorded}
            className="aspect-video w-full rounded-xl border-4 object-contain"
            style={{ backgroundColor: colors.fill, borderColor: colors.fill }}
            aria-label="Your video"
          />
          {props.video.recorded ? (
            <Button type="button" variant="outline" onClick={() => props.onVideo(null)} disabled={props.disabled}>
              Re-record
            </Button>
          ) : (
            upload("Choose another")
          )}
        </>
      ) : cameraProblem ? (
        <>
          <p
            className="rounded-xl border p-4 text-sm"
            style={{ backgroundColor: colors.fill, color: colors.text, borderColor: `${colors.text}33` }}
          >
            {cameraProblem}
          </p>
          {upload("Upload a video")}
        </>
      ) : (
        <>
          <VideoRecorder
            color={props.color}
            onRecorded={(recorded) => props.onVideo({ file: recorded, recorded: true })}
            onUnavailable={setCameraProblem}
          />
          {upload("Upload a video", "ghost")}
        </>
      )}
    </div>
  );
}
