import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { Confirm, ErrorMessage, LinkedText } from "@/components/page";
import { NoteCard, NoteDialog, type NoteDraft } from "@/components/notes";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../api.js";
import type { Note } from "../notes.js";
import { REACTIONS, summary, summaryLabel, whoReacted, type Reactions as ReactionsData } from "../reactions.js";

type Update = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
  reactions: ReactionsData;
  notes: Note[];
};

// The width of an update's card when its notes sit beside it on a wide screen.
const UPDATE_WIDTH = "lg:w-[42rem]";
// Notes shown beside an update; the rest are a link away, on the wall.
const NOTES_SHOWN = 6;

// canEdit: the viewer is a family member. name: theirs, or null until they give one with a
// note; onNamed passes it back once a note sets it.
export function Feed(props: { slug: string; canEdit: boolean; name: string | null; onNamed: (name: string) => void }) {
  const { slug, canEdit } = props;
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const { status, data } = await api<{ updates: Update[] }>(slug, "updates");
    if (status === 200) setUpdates(data.updates);
    else setError("Couldn't load updates. Please refresh the page.");
  }

  useEffect(() => {
    load();
  }, [slug]);

  // Runs a change, then reloads the feed. Returns whether it worked.
  async function change(path: string, method: string, body?: unknown): Promise<boolean> {
    setError("");
    const { status, data } = await api<{ error?: string }>(slug, path, { method, body });
    if (status >= 300) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return false;
    }
    await load();
    return true;
  }

  // Returns an error for the dialog to show, or null once the note is saved.
  async function leaveNote(updateId: string, draft: NoteDraft): Promise<string | null> {
    const { status, data } = await api<{ name?: string; error?: string }>(slug, "notes", {
      method: "POST",
      body: { updateId, ...draft },
    });
    if (status >= 300) return data?.error ?? "Something went wrong. Please try again.";
    if (data.name && props.name === null) props.onNamed(data.name);
    await load();
    return null;
  }

  return (
    <section className="space-y-6">
      {canEdit && (
        <div className={UPDATE_WIDTH}>
          <PostForm onPost={(body, notify) => change("updates", "POST", { body, notify })} />
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {updates?.length === 0 && <p className="text-muted-foreground">No updates yet.</p>}
      {updates?.map((update) => (
        <UpdateItem
          key={update.id}
          update={update}
          canEdit={canEdit}
          onEdit={(body) => change(`updates/${update.id}`, "PATCH", { body })}
          onDelete={() => change(`updates/${update.id}`, "DELETE")}
          onReact={(kind) => change("reactions", "POST", { updateId: update.id, kind })}
          slug={slug}
          name={props.name}
          onLeaveNote={(draft) => leaveNote(update.id, draft)}
          onDeleteNote={(id) => change(`notes/${id}`, "DELETE")}
        />
      ))}
    </section>
  );
}

function PostForm({ onPost }: { onPost: (body: string, notify: boolean) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);
  const [posting, setPosting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPosting(true);
    if (await onPost(body, notify)) {
      setBody("");
      setNotify(true);
    }
    setPosting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post an update</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Textarea className="min-h-32" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Update" />
          <Label>
            <Checkbox checked={notify} onCheckedChange={(checked) => setNotify(checked === true)} />
            Notify supporters by email
          </Label>
          <Button disabled={posting || !body.trim()}>Post</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UpdateItem(props: {
  update: Update;
  canEdit: boolean;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onReact: (kind: string | null) => Promise<boolean>;
  slug: string;
  name: string | null;
  onLeaveNote: (draft: NoteDraft) => Promise<string | null>;
  onDeleteNote: (id: string) => Promise<boolean>;
}) {
  const { update } = props;
  const [writing, setWriting] = useState(false);
  const noteCount = update.notes.length;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    if (await props.onEdit(draft)) setDraft(null);
    setSaving(false);
  }

  return (
    // On a wide screen the update's notes sit beside its card; on a phone, below it.
    <article className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Visible overflow, so the reaction tray is never clipped by the card's edge. */}
      <Card className={cn("overflow-visible lg:shrink-0", UPDATE_WIDTH)}>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{update.authorName}</span> ·{" "}
            {new Date(update.createdAt).toLocaleString()}
            {update.editedAt && " · edited"}
          </p>
        </CardHeader>
        <CardContent className="text-base">
          {draft === null ? (
            <LinkedText text={update.body} />
          ) : (
            <Textarea className="min-h-32" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Update" />
          )}
          <Reactions update={update} onReact={props.onReact} />
          <Button variant="outline" className="mt-3 h-11 rounded-full px-4" onClick={() => setWriting(true)}>
            Leave a note
          </Button>
          <NoteDialog open={writing} onOpenChange={setWriting} name={props.name} onLeave={props.onLeaveNote} />
        </CardContent>
        {props.canEdit && (
          <CardFooter className="flex flex-wrap items-center gap-2 border-t py-3">
            {draft !== null ? (
              <>
                <Button onClick={save} disabled={saving || !draft.trim()}>
                  Save
                </Button>
                <Button variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </>
            ) : confirmingDelete ? (
              <Confirm yes="Yes, delete" onYes={props.onDelete} onCancel={() => setConfirmingDelete(false)}>
                Delete this update{noteCount > 0 && ` and its ${noteCount === 1 ? "note" : `${noteCount} notes`}`}? This
                can't be undone.
              </Confirm>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDraft(update.body)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
                  Delete
                </Button>
              </>
            )}
          </CardFooter>
        )}
      </Card>
      {noteCount > 0 && (
        <aside className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-1" aria-label="Notes">
          {update.notes.slice(0, NOTES_SHOWN).map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canDelete={props.canEdit || note.mine}
              onDelete={() => props.onDeleteNote(note.id)}
            />
          ))}
          {noteCount > NOTES_SHOWN && (
            <a className="text-sm font-medium" href={`/f/${props.slug}/wall#update=${update.id}`}>
              See all {noteCount} notes
            </a>
          )}
        </aside>
      )}
    </article>
  );
}

const HOVER_DELAY = 300;

// A React button that opens a tray of the six emoji, and a summary ("❤️🙏😂")
// that shows who reacted. With a mouse, hovering opens either one; on a phone, tapping does.
function Reactions({ update, onReact }: { update: Update; onReact: (kind: string | null) => Promise<boolean> }) {
  const r = update.reactions;
  const [tray, setTray] = useState(false);
  const [names, setNames] = useState<"closed" | "hover" | "pinned">("closed");
  const [pending, setPending] = useState(false);
  const area = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // The button and tray share one hover area, and the delay lets the pointer cross to the tray.
  // Touch has no hover, so it's ignored here and a tap opens the tray instead.
  function hoverTray(e: PointerEvent, open: boolean) {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTray(open), HOVER_DELAY);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!tray) return;
    const outside = (e: globalThis.PointerEvent) => {
      if (!area.current?.contains(e.target as Node)) setTray(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTray(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [tray]);

  async function pick(kind: string) {
    window.clearTimeout(timer.current);
    setTray(false);
    setPending(true);
    await onReact(kind === r.mine ? null : kind);
    setPending(false);
  }

  const mine = REACTIONS.find((x) => x.kind === r.mine);
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className="relative"
          ref={area}
          onPointerEnter={(e) => hoverTray(e, true)}
          onPointerLeave={(e) => hoverTray(e, false)}
        >
          <Button
            ref={button}
            variant="outline"
            className={cn("h-11 min-w-11 rounded-full px-4", mine && "border-foreground bg-muted text-2xl")}
            aria-label={mine ? `Your reaction: ${mine.name}. Change it` : "React"}
            aria-expanded={tray}
            disabled={pending}
            onClick={() => {
              window.clearTimeout(timer.current);
              setTray(true);
            }}
          >
            {mine ? mine.emoji : "React"}
          </Button>
          {tray && (
            <span
              className="absolute bottom-full left-0 z-10 mb-1 flex gap-0.5 rounded-full border bg-popover p-1 shadow-md"
              role="group"
              aria-label="Pick a reaction"
            >
              {REACTIONS.map((x) => (
                <button
                  key={x.kind}
                  className="size-11 rounded-full text-[1.6rem] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:ring-2 aria-pressed:ring-foreground"
                  aria-label={x.name}
                  aria-pressed={x.kind === r.mine}
                  onClick={() => pick(x.kind)}
                >
                  {x.emoji}
                </button>
              ))}
            </span>
          )}
        </span>
        {r.count > 0 && (
          <span
            className="relative"
            onPointerEnter={(e) => e.pointerType === "mouse" && setNames((n) => (n === "pinned" ? n : "hover"))}
            onPointerLeave={() => setNames((n) => (n === "hover" ? "closed" : n))}
          >
            <button
              className="rounded-sm py-2 text-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={summaryLabel(r)}
              aria-expanded={names === "pinned"}
              onClick={() => setNames((n) => (n === "pinned" ? "closed" : "pinned"))}
            >
              {summary(r)}
            </button>
            {names === "hover" && (
              <NameList
                r={r}
                className="absolute top-full left-0 z-10 rounded-md bg-foreground px-3 py-1.5 text-sm whitespace-nowrap text-background"
              />
            )}
          </span>
        )}
      </div>
      {names === "pinned" && <NameList r={r} className="mt-2 text-sm text-muted-foreground" />}
    </>
  );
}

function NameList({ r, className }: { r: ReactionsData; className: string }) {
  return (
    <ul className={className}>
      {whoReacted(r).map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}
