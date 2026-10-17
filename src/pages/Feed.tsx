import { MessageSquareHeartIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Confirm, ErrorMessage } from "@/components/page";
import { EmptyNoteButton, NoteCard, NoteDialog, type NoteDraft } from "@/components/notes";
import { PostSettings } from "@/components/postSettings";
import { ReactionControls } from "@/components/reactions";
import { VideoCapture, VideoPlayer, type Playable } from "@/components/video";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type Me } from "../api.js";
import { applyFetched, newUpdatesLabel } from "../liveFeed.js";
import { followLink } from "../navigate.js";
import { USUAL_REACTIONS } from "../lib/reactionCatalog.js";
import type { Note } from "../notes.js";
import type { Reactions as ReactionsData } from "../reactions.js";
import { RichText } from "../richText.js";
import { uploadVideo } from "../videos.js";

// Supporters never load the editor; family members load it when they first write or edit.
const RichEditor = lazy(() => import("../editor/RichEditor.js"));

type PhotoMode = Me["family"]["photos"];

type Update = {
  id: string;
  content: unknown;
  video: Playable | null;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
  reactions: ReactionsData;
  // False: no new notes; the ones already left stay.
  allowNotes: boolean;
  notes: Note[];
};

type PostSettingsValues = { notify: boolean; reactions: string[]; allowNotes: boolean };

// The width of an update's card when its notes sit beside it on a wide screen.
const UPDATE_WIDTH = "lg:w-[42rem]";
// Notes shown beside an update; the rest are a link away, on the wall.
const NOTES_SHOWN = 6;
// How often an open, visible feed checks for changes.
const CHECK_EVERY = 30_000;

// canEdit: the viewer is a family member. name: theirs, or null until they give one.
// onNamed passes a name back once a note saves one. onSignedOut: a check found the reader's
// session ended, for example because they were removed.
export function Feed(props: {
  slug: string;
  canEdit: boolean;
  photos: PhotoMode;
  name: string | null;
  onNamed: (name: string) => void;
  onSignedOut: () => void;
}) {
  const { slug, canEdit } = props;
  const [updates, setUpdates] = useState<Update[] | null>(null);
  // Where the post form's "Allow notes" starts. Re-read with every load, so a change on the
  // People page reaches the form without a reload.
  const [allowNotesByDefault, setAllowNotesByDefault] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [error, setError] = useState("");
  // The updates the reader has been shown; newer ones wait behind the "new updates" button.
  const shownIds = useRef(new Set<string>());
  // Set when the next response should show everything. It outlives a request that a newer one
  // overtakes, so a check can't hide the reader's own post.
  const showAll = useRef(true);
  // Only the newest request's response is applied, so a slow one can't undo a fresher one.
  const latest = useRef(0);

  // Fetches the feed. everything: show new updates too, as on first load, after the reader's
  // own post, or from the button. A failed check shows nothing and waits for the next one.
  async function load(everything = false) {
    if (everything) showAll.current = true;
    const request = ++latest.current;
    const { status, data } = await api<{ updates: Update[]; defaults: { allowNotesByDefault: boolean } | null }>(
      slug,
      "updates",
    );
    if (request !== latest.current) return;
    if (status === 401) return props.onSignedOut();
    if (status !== 200) {
      if (shownIds.current.size === 0 && showAll.current) setError("Couldn't load updates. Please refresh the page.");
      return;
    }
    if (showAll.current) {
      showAll.current = false;
      shownIds.current = new Set(data.updates.map((u) => u.id));
    }
    if (data.defaults) setAllowNotesByDefault(data.defaults.allowNotesByDefault);
    const { visible, waiting } = applyFetched(shownIds.current, data.updates);
    setUpdates(visible);
    setWaiting(waiting);
  }

  // Checks every so often while the page is visible, and at once when the reader comes back.
  // A changed name reloads too, so notes, reactions, and updates already on screen show it.
  useEffect(() => {
    load(true);
    let timer: number | undefined;
    const follow = () => {
      window.clearInterval(timer);
      if (document.visibilityState !== "visible") return;
      timer = window.setInterval(load, CHECK_EVERY);
    };
    const comeBack = () => {
      if (document.visibilityState === "visible") load();
      follow();
    };
    follow();
    document.addEventListener("visibilitychange", comeBack);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", comeBack);
    };
  }, [slug, props.name]);

  function showNew() {
    load(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Runs a change, then reloads the feed. Returns whether it worked. everything: as for load.
  async function change(path: string, method: string, body?: unknown, everything = false): Promise<boolean> {
    setError("");
    const { status, data } = await api<{ error?: string }>(slug, path, { method, body });
    if (status >= 300) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return false;
    }
    await load(everything);
    return true;
  }

  // Returns an error for the dialog to show, or null once the note is saved.
  async function leaveNote(updateId: string, draft: NoteDraft): Promise<string | null> {
    const { status, data } = await api<{ name?: string; error?: string }>(slug, "notes", {
      method: "POST",
      body: { updateId, ...draft },
    });
    if (status >= 300) return data?.error ?? "Something went wrong. Please try again.";
    if (data.name) props.onNamed(data.name);
    await load();
    return null;
  }

  return (
    <section className="space-y-6">
      {canEdit && (
        <div className={UPDATE_WIDTH}>
          <PostForm
            slug={slug}
            photos={props.photos}
            allowNotesByDefault={allowNotesByDefault}
            onPost={(body, settings) => change("updates", "POST", { ...body, ...settings }, true)}
          />
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {waiting > 0 && (
        // Fixed, so it shows wherever the reader is and never moves the page.
        <div className="fixed inset-x-0 top-3 z-20 flex justify-center px-4">
          <Button className="rounded-full shadow-md" onClick={showNew}>
            {newUpdatesLabel(waiting)}
          </Button>
        </div>
      )}
      {updates?.length === 0 && <p className="text-muted-foreground">No updates yet.</p>}
      {updates?.map((update) => (
        <UpdateItem
          key={update.id}
          update={update}
          canEdit={canEdit}
          photos={props.photos}
          onEdit={(content, reactions, allowNotes) => change(`updates/${update.id}`, "PATCH", { content, reactions, allowNotes })}
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
  allowNotesByDefault,
  onPost,
}: {
  slug: string;
  photos: PhotoMode;
  allowNotesByDefault: boolean;
  onPost: (body: { content?: unknown; video?: string }, settings: PostSettingsValues) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"write" | "video">("write");
  const [content, setContent] = useState<unknown>(null);
  const [video, setVideo] = useState<{ file: File; recorded: boolean } | null>(null);
  const file = video?.file ?? null;
  // Once uploaded, a retry after a failed post reuses the video rather than uploading it again.
  const [uploaded, setUploaded] = useState<{ file: File; publicId: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notify, setNotify] = useState(true);
  const [reactions, setReactions] = useState<string[]>([...USUAL_REACTIONS]);
  // Null until chosen, so it follows the family's default, which arrives after this mounts.
  const [chosenAllowNotes, setChosenAllowNotes] = useState<boolean | null>(null);
  const allowNotes = chosenAllowNotes ?? allowNotesByDefault;
  // Changing the key closes Post settings and starts them fresh after posting.
  const [settingsKey, setSettingsKey] = useState(0);
  const [posting, setPosting] = useState(false);
  // Changing the key starts a fresh, empty editor after posting.
  const [editorKey, setEditorKey] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPosting(true);
    setError("");
    const posted = mode === "write" ? content !== null && (await onPost({ content }, { notify, reactions, allowNotes })) : await postVideo();
    if (posted) {
      setContent(null);
      setVideo(null);
      setUploaded(null);
      setEditorKey((k) => k + 1);
      setNotify(true);
      setReactions([...USUAL_REACTIONS]);
      setChosenAllowNotes(null);
      setSettingsKey((k) => k + 1);
      setMode("write");
    }
    setProgress(null);
    setPosting(false);
  }

  async function postVideo(): Promise<boolean> {
    if (!file) return false;
    let publicId = uploaded?.file === file ? uploaded.publicId : null;
    if (!publicId) {
      try {
        setProgress(0);
        publicId = await uploadVideo(slug, file, setProgress);
        setUploaded({ file, publicId });
      } catch (err) {
        setError((err as Error).message);
        return false;
      }
    }
    setProgress(1);
    return onPost({ video: publicId }, { notify, reactions, allowNotes });
  }

  const ready = mode === "write" ? content !== null : file !== null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Post an update</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "write" | "video")}>
            <TabsList className="w-full">
              <TabsTrigger value="write" disabled={posting}>
                Write
              </TabsTrigger>
              <TabsTrigger value="video" disabled={posting}>
                Video
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Kept mounted while recording, so a draft and any photo upload survive a tab switch. */}
          <div hidden={mode !== "write"}>
            <EditorSlot>
              <RichEditor key={editorKey} slug={slug} photos={photos} onChange={setContent} />
            </EditorSlot>
          </div>
          {mode === "video" && (
            <VideoCapture maxSeconds={null} video={video} disabled={posting} onVideo={setVideo} onError={setError} />
          )}
          {progress !== null && (
            <p className="text-sm text-muted-foreground" role="status">
              {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : "Posting…"}
            </p>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <PostSettings
            key={settingsKey}
            notify={notify}
            onNotify={setNotify}
            reactions={reactions}
            onReactions={setReactions}
            allowNotes={allowNotes}
            onAllowNotes={setChosenAllowNotes}
            disabled={posting}
          >
            <Button disabled={posting || !ready}>{mode === "video" && error ? "Try again" : "Post"}</Button>
          </PostSettings>
        </form>
      </CardContent>
    </Card>
  );
}

function UpdateItem(props: {
  update: Update;
  canEdit: boolean;
  photos: PhotoMode;
  onEdit: (content: unknown, reactions: string[], allowNotes: boolean) => Promise<boolean>;
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
  const [reactions, setReactions] = useState<string[]>([]);
  const [allowNotes, setAllowNotes] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    if (await props.onEdit(draft, reactions, allowNotes)) setEditing(false);
    setSaving(false);
  }

  function startEditing() {
    setDraft(update.content);
    setReactions(update.reactions.allowed);
    setAllowNotes(update.allowNotes);
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
          {update.video ? (
            <VideoPlayer video={update.video} kind="update" authorName={update.authorName} />
          ) : editing ? (
            <EditorSlot>
              <RichEditor initial={update.content} slug={props.slug} photos={props.photos} onChange={setDraft} />
            </EditorSlot>
          ) : (
            <RichText doc={update.content} />
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-2">
          {editing ? (
            <div className="w-full space-y-4">
              <PostSettings
                reactions={reactions}
                onReactions={setReactions}
                allowNotes={allowNotes}
                onAllowNotes={setAllowNotes}
                disabled={saving}
              >
                <Button onClick={save} disabled={saving || draft === null}>
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </PostSettings>
            </div>
          ) : confirmingDelete ? (
            <Confirm yes="Yes, delete" onYes={props.onDelete} onCancel={() => setConfirmingDelete(false)}>
              Delete this update{noteCount > 0 && ` and its ${noteCount === 1 ? "note" : `${noteCount} notes`}`}? This
              can't be undone.
            </Confirm>
          ) : (
            <>
              <ReactionControls reactions={update.reactions} onReact={props.onReact}>
                {update.allowNotes && (
                  <Button
                    variant="outline"
                    className="size-11 rounded-full [&_svg]:size-5"
                    aria-label="Leave a note"
                    onClick={() => setWriting(true)}
                  >
                    <MessageSquareHeartIcon aria-hidden />
                  </Button>
                )}
              </ReactionControls>
              {props.canEdit && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {!update.video && (
                    <Button variant="outline" onClick={startEditing}>
                      Edit
                    </Button>
                  )}
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
      {/* Only the buttons go when notes are off: a dialog already open stays, and its post is refused. */}
      {noteCount === 0 && update.allowNotes && (
        // Only on a wide screen, where notes sit beside the update; on a phone it would crowd the feed.
        <aside className="hidden min-w-0 flex-1 lg:block" aria-label="Notes">
          <EmptyNoteButton onLeave={() => setWriting(true)} />
        </aside>
      )}
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
            <a className="text-sm font-medium" href={`/f/${props.slug}/wall#update=${update.id}`} onClick={followLink}>
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
