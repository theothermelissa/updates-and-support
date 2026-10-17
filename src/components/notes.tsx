import { useState, type FormEvent } from "react";
import { EllipsisIcon, MessageSquareHeartIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "cn";
import { Confirm, ErrorMessage, Field, LinkedText } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ReactionControls, Reveal, type RevealState } from "@/components/reactions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoCapture, VideoPlayer } from "@/components/video";
import { COLORS, MAX_NOTE, PALETTE, noteTime, randomColor, type Note, type NoteColor } from "../notes.js";
import { uploadVideo } from "../videos.js";

// A note as a card in its color, with Delete for those allowed. A video note's card is the
// video's still, edge to edge inside a thin frame in the note's color, signed by its author.
// A written note is signed in its own text, so its author and time are behind a control.
export function NoteCard(props: {
  note: Note;
  canDelete: boolean;
  onDelete: () => Promise<boolean>;
  onReact: (kind: string | null) => Promise<boolean>;
}) {
  const { note } = props;
  const [confirming, setConfirming] = useState(false);
  const [author, setAuthor] = useState<RevealState>("closed");
  const colors = PALETTE[note.color];
  const byline = `${note.authorName} · ${noteTime(note)}`;
  // Always on the card, so a supporter can't pass as family by signing a name in their text.
  const family = note.authorIsFamily && (
    <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: `${colors.text}66` }}>
      Family
    </span>
  );
  return (
    <Bubble
      color={note.color}
      className={cn("text-base", note.video ? "space-y-2 p-1.5 pb-4" : "space-y-3 p-4")}
      style={{ color: colors.text }}
    >
      {note.video ? (
        <VideoPlayer video={note.video} kind="note" authorName={note.authorName} fill={colors.fill} />
      ) : (
        <LinkedText text={note.body} className="font-medium [&_a]:text-inherit" />
      )}
      <div className={cn("space-y-3", note.video && "px-2.5")}>
        {note.video && (
          <p className="text-sm">
            — {note.authorName} {family}
          </p>
        )}
        <ReactionControls
          reactions={note.reactions}
          onReact={props.onReact}
          below={author === "pinned" && <p className="text-sm">{byline}</p>}
        >
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            {note.video ? (
              <time className="opacity-80" dateTime={note.createdAt}>
                {noteTime(note)}
              </time>
            ) : (
              <>
                {family}
                <Reveal
                  state={author}
                  setState={setAuthor}
                  className="flex size-11 items-center justify-center rounded-full opacity-80 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-black/5 [&_svg]:size-5"
                  label={`Left by ${byline}`}
                  trigger={<EllipsisIcon aria-hidden />}
                  content={byline}
                />
              </>
            )}
            {props.canDelete && !confirming && (
              <button type="button" className="underline underline-offset-2 opacity-80" onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
          </div>
        </ReactionControls>
        {confirming && (
          <div className="text-foreground">
            <Confirm yes="Yes, delete" onYes={props.onDelete} onCancel={() => setConfirming(false)}>
              Delete this note? This can't be undone.
            </Confirm>
          </div>
        )}
      </div>
    </Bubble>
  );
}

// Holds a note's place beside an update with none yet: a round "Leave a note" button in the
// palette's Oak color that opens the note dialog.
export function EmptyNoteButton({ onLeave }: { onLeave: () => void }) {
  const colors = PALETTE.oak;
  return (
    <Button
      variant="outline"
      className="size-11 rounded-full [&_svg]:size-5"
      style={{ backgroundColor: colors.fill, color: colors.text, borderColor: `${colors.text}33` }}
      aria-label="Leave a note"
      onClick={onLeave}
    >
      <MessageSquareHeartIcon aria-hidden />
    </Button>
  );
}

const TAIL_WIDTH = 16;
const TAIL_HEIGHT = 12;

// A card in a note color shaped like a message bubble, after the "Leave a note" icon: its
// square bottom-left corner runs down into a tail. The outer element leaves room below for
// the tail, so it never overlaps whatever comes next.
function Bubble(props: {
  color: NoteColor;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const colors = PALETTE[props.color];
  const border = `${colors.text}33`;
  return (
    <article className="relative break-inside-avoid" style={{ paddingBottom: TAIL_HEIGHT }}>
      <div
        className={cn("rounded-xl rounded-bl-none border", props.className)}
        style={{ backgroundColor: colors.fill, borderColor: border, ...props.style }}
      >
        {props.children}
      </div>
      {/* Outside the card, so the card's space-y spacing ignores it. Starts on the card's
          bottom border, covering it where the tail joins. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0"
        width={TAIL_WIDTH + 1}
        height={TAIL_HEIGHT + 1}
        viewBox={`0 0 ${TAIL_WIDTH + 1} ${TAIL_HEIGHT + 1}`}
      >
        <path d={`M0 0V${TAIL_HEIGHT + 0.5}L${TAIL_WIDTH + 1} 0Z`} fill={colors.fill} />
        <path d={`M0.5 1V${TAIL_HEIGHT}L${TAIL_WIDTH} 0.5`} fill="none" stroke={border} strokeLinejoin="round" />
      </svg>
    </article>
  );
}

// What the dialog leaves: a written note's body, or a posted video's public ID.
export type NoteDraft = { body?: string; video?: string; color: NoteColor; name?: string };

// The "Leave a note" dialog. Starts in a random color. The name is filled in when they have
// one, and they can change it; it's saved with the note.
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
  const [name, setName] = useState(props.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const colors = PALETTE[color];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const named = { name };
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
      <Tabs value={mode} onValueChange={(v) => setMode(v as "write" | "video")}>
        <TabsList className="w-full">
          <TabsTrigger value="write" disabled={busy}>
            Written note
          </TabsTrigger>
          <TabsTrigger value="video" disabled={busy}>
            Video note
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === "write" ? (
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
      ) : (
        <VideoCapture color={color} maxSeconds={60} video={video} disabled={busy} onVideo={setVideo} onError={setError} />
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
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
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
        <Button disabled={busy || !ready || !name.trim()}>
          {mode === "write" ? "Leave note" : error ? "Try again" : "Post"}
        </Button>
      </DialogFooter>
    </form>
  );
}
