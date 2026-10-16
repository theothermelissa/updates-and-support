import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Confirm, ErrorMessage } from "@/components/page";
import { NoteCard, NoteDialog, type NoteDraft } from "@/components/notes";
import { ReactionControls } from "@/components/reactions";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api, type Me } from "../api.js";
import type { Note } from "../notes.js";
import type { Reactions as ReactionsData } from "../reactions.js";
import { RichText } from "../richText.js";

// Supporters never load the editor; family members load it when they first write or edit.
const RichEditor = lazy(() => import("../editor/RichEditor.js"));

type PhotoMode = Me["family"]["photos"];

type Update = {
  id: string;
  content: unknown;
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
export function Feed(props: {
  slug: string;
  canEdit: boolean;
  photos: PhotoMode;
  name: string | null;
  onNamed: (name: string) => void;
}) {
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
          <PostForm slug={slug} photos={props.photos} onPost={(content, notify) => change("updates", "POST", { content, notify })} />
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {updates?.length === 0 && <p className="text-muted-foreground">No updates yet.</p>}
      {updates?.map((update) => (
        <UpdateItem
          key={update.id}
          update={update}
          canEdit={canEdit}
          photos={props.photos}
          onEdit={(content) => change(`updates/${update.id}`, "PATCH", { content })}
          onDelete={() => change(`updates/${update.id}`, "DELETE")}
          onReact={(kind) => change("reactions", "POST", { updateId: update.id, kind })}
          slug={slug}
          name={props.name}
          onLeaveNote={(draft) => leaveNote(update.id, draft)}
          onDeleteNote={(id) => change(`notes/${id}`, "DELETE")}
          onReactToNote={(id, kind) => change("reactions", "POST", { noteId: id, kind })}
        />
      ))}
    </section>
  );
}

function PostForm({
  slug,
  photos,
  onPost,
}: {
  slug: string;
  photos: PhotoMode;
  onPost: (content: unknown, notify: boolean) => Promise<boolean>;
}) {
  const [content, setContent] = useState<unknown>(null);
  const [notify, setNotify] = useState(true);
  const [posting, setPosting] = useState(false);
  // Changing the key starts a fresh, empty editor after posting.
  const [editorKey, setEditorKey] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (content === null) return;
    setPosting(true);
    if (await onPost(content, notify)) {
      setContent(null);
      setEditorKey((k) => k + 1);
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
          <EditorSlot>
            <RichEditor key={editorKey} slug={slug} photos={photos} onChange={setContent} />
          </EditorSlot>
          <Label>
            <Checkbox checked={notify} onCheckedChange={(checked) => setNotify(checked === true)} />
            Notify supporters by email
          </Label>
          <Button disabled={posting || content === null}>Post</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UpdateItem(props: {
  update: Update;
  canEdit: boolean;
  photos: PhotoMode;
  onEdit: (content: unknown) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onReact: (kind: string | null) => Promise<boolean>;
  slug: string;
  name: string | null;
  onLeaveNote: (draft: NoteDraft) => Promise<string | null>;
  onDeleteNote: (id: string) => Promise<boolean>;
  onReactToNote: (id: string, kind: string | null) => Promise<boolean>;
}) {
  const { update } = props;
  const [writing, setWriting] = useState(false);
  const noteCount = update.notes.length;
  // While editing: the document to save, or null while the editor is empty.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    if (await props.onEdit(draft)) setEditing(false);
    setSaving(false);
  }

  function startEditing() {
    setDraft(update.content);
    setEditing(true);
  }

  return (
    // On a wide screen the update's notes sit beside its card; on a phone, below it.
    <article className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Visible overflow, so the reaction tray is never clipped by the card's edge. */}
      <Card className={cn("overflow-visible lg:shrink-0", UPDATE_WIDTH)}>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{update.authorName}</span> ·{" "}
            {new Date(update.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {update.editedAt && " · edited"}
          </p>
        </CardHeader>
        <CardContent className="text-base">
          {editing ? (
            <EditorSlot>
              <RichEditor initial={update.content} slug={props.slug} photos={props.photos} onChange={setDraft} />
            </EditorSlot>
          ) : (
            <RichText doc={update.content} />
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button onClick={save} disabled={saving || draft === null}>
                Save
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>
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
              <ReactionControls reactions={update.reactions} onReact={props.onReact}>
                <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => setWriting(true)}>
                  Leave a note
                </Button>
              </ReactionControls>
              {props.canEdit && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={startEditing}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
                    Delete
                  </Button>
                </div>
              )}
            </>
          )}
        </CardFooter>
      </Card>
      <NoteDialog open={writing} onOpenChange={setWriting} slug={props.slug} name={props.name} onLeave={props.onLeaveNote} />
      {noteCount > 0 && (
        <aside className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-1" aria-label="Notes">
          {update.notes.slice(0, NOTES_SHOWN).map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canDelete={props.canEdit || note.mine}
              onDelete={() => props.onDeleteNote(note.id)}
              onReact={(kind) => props.onReactToNote(note.id, kind)}
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

// Holds the editor's place, at its height, while it loads.
function EditorSlot({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="h-[12.5rem] rounded-lg border border-input" aria-busy="true" />}>
      {children}
    </Suspense>
  );
}
