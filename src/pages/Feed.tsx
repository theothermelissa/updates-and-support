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
import {
  audienceBody,
  audienceLabel,
  canShare,
  changedAudience,
  choiceFor,
  EVERYONE,
  type Audience,
  type AudienceBody,
  type AudienceChoice,
  type Group,
} from "../audience.js";
import { applyFetched, newUpdatesLabel } from "../liveFeed.js";
import { followLink } from "../navigate.js";
import { USUAL_REACTIONS } from "../lib/reactionCatalog.js";
import type { Note } from "../notes.js";
import type { Reactions as ReactionsData } from "../reactions.js";
import { RichText } from "../richText.js";
import { toLocalInput } from "../photoDate.js";
import { usePostedDate } from "../usePostedDate.js";
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
  // Sent to family members only.
  audience?: Audience;
  // Sent to family members only: when each photo was taken, by public ID, for those that have a date.
  photoDates?: Record<string, string>;
};

type PostSettingsValues = {
  audience: AudienceBody;
  notify: boolean;
  reactions: string[];
  allowNotes: boolean;
  // Set only when the update is dated to something other than now.
  postedAt?: string;
  // Taken dates of the photos in the update, by public ID.
  photoDates?: Record<string, string>;
};

// The width of an update's card when its notes sit beside it on a wide screen.
const UPDATE_WIDTH = "lg:w-[42rem]";
// Notes shown beside an update; the rest are a link away, on the wall.
const NOTES_SHOWN = 6;
// How often an open, visible feed checks for changes.
const CHECK_EVERY = 30_000;

// canEdit: the viewer is a family member. name: theirs, or null until they give one.
// inviteOnly: Post settings always offers "Who can see this", with Family members only.
// onNamed passes a name back once a note saves one. onSignedOut: a check found the reader's
// session ended, for example because they were removed.
export function Feed(props: {
  slug: string;
  canEdit: boolean;
  photos: PhotoMode;
  inviteOnly: boolean;
  name: string | null;
  onNamed: (name: string) => void;
  onSignedOut: () => void;
}) {
  const { slug, canEdit } = props;
  const [updates, setUpdates] = useState<Update[] | null>(null);
  // Where the post form's "Allow notes" starts. Re-read with every load, so a change on the
  // People page reaches the form without a reload.
  const [allowNotesByDefault, setAllowNotesByDefault] = useState(true);
  // The family's groups, sorted by name, for "Who can see this". Family members only.
  const [groups, setGroups] = useState<Group[]>([]);
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
    const { status, data } = await api<{
      updates: Update[];
      defaults: { allowNotesByDefault: boolean; groups?: Group[] } | null;
    }>(slug, "updates");
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
    if (data.defaults) {
      setAllowNotesByDefault(data.defaults.allowNotesByDefault);
      setGroups(data.defaults.groups ?? []);
    }
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
  // A failed change reloads too, so the forms see what changed under them, such as a deleted group.
  async function change(path: string, method: string, body?: unknown, everything = false): Promise<boolean> {
    setError("");
    const { status, data } = await api<{ error?: string }>(slug, path, { method, body });
    if (status >= 300) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      load();
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
            groups={groups}
            inviteOnly={props.inviteOnly}
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
          groups={groups}
          inviteOnly={props.inviteOnly}
          onEdit={(content, reactions, allowNotes, audience, postedAt, photoDates) =>
            change(`updates/${update.id}`, "PATCH", {
              content,
              reactions,
              allowNotes,
              ...(audience && { audience }),
              ...(postedAt && { postedAt }),
              ...(photoDates && { photoDates }),
            })
          }
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
  groups,
  inviteOnly,
  onPost,
}: {
  slug: string;
  photos: PhotoMode;
  allowNotesByDefault: boolean;
  groups: Group[];
  inviteOnly: boolean;
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
  const [audience, setAudience] = useState<AudienceChoice>(EVERYONE);
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
  const dating = usePostedDate(content, null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPosting(true);
    setError("");
    const posted = mode === "write" ? content !== null && (await onPost({ content }, settings())) : await postVideo();
    if (posted) {
      setContent(null);
      setVideo(null);
      setUploaded(null);
      setEditorKey((k) => k + 1);
      setAudience(EVERYONE);
      setNotify(true);
      setReactions([...USUAL_REACTIONS]);
      setChosenAllowNotes(null);
      dating.reset();
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
    return onPost({ video: publicId }, settings());
  }

  // A video can't be dated, so the date applies to the Write tab only.
  function settings(): PostSettingsValues {
    const postedAt = mode === "write" ? dating.postedAt() : undefined;
    const photoDates = mode === "write" ? dating.photoDates() : undefined;
    return {
      audience: audienceBody(audience, groups),
      notify,
      reactions,
      allowNotes,
      ...(postedAt && { postedAt }),
      ...(photoDates && { photoDates }),
    };
  }

  const ready =
    (mode === "write" ? content !== null && !dating.invalid : file !== null) && canShare(audience, groups);
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
              <RichEditor
                key={editorKey}
                slug={slug}
                photos={photos}
                onChange={setContent}
                onPhotoDate={dating.onPhotoDate}
              />
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
            groups={groups}
            inviteOnly={inviteOnly}
            audience={audience}
            onAudience={setAudience}
            notify={notify}
            onNotify={setNotify}
            reactions={reactions}
            onReactions={setReactions}
            allowNotes={allowNotes}
            onAllowNotes={setChosenAllowNotes}
            posted={
              photos === "off" || mode === "video"
                ? undefined
                : {
                    on: dating.on,
                    // Dating an update to the past is rarely worth emailing everyone about.
                    onOn: (on) => {
                      dating.setOn(on);
                      if (on) setNotify(false);
                    },
                    value: dating.value,
                    onValue: dating.setValue,
                    noneFound: dating.noneFound,
                    showField: false,
                  }
            }
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
  groups: Group[];
  inviteOnly: boolean;
  // audience and postedAt: undefined when they didn't change.
  onEdit: (
    content: unknown,
    reactions: string[],
    allowNotes: boolean,
    audience: AudienceBody | undefined,
    postedAt: string | undefined,
    photoDates: Record<string, string> | undefined,
  ) => Promise<boolean>;
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
  // The audience the update had when editing started, and the one chosen since.
  const [startAudience, setStartAudience] = useState<AudienceChoice>(EVERYONE);
  const [audience, setAudience] = useState<AudienceChoice>(EVERYONE);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const label = props.canEdit ? audienceLabel(update.audience) : null;
  const posted = usePostedDate(draft, toLocalInput(new Date(update.createdAt)));

  async function save() {
    if (draft === null) return;
    setSaving(true);
    const changed = changedAudience(startAudience, audience, props.groups);
    if (await props.onEdit(draft, reactions, allowNotes, changed, posted.postedAt(), posted.photoDates())) setEditing(false);
    setSaving(false);
  }

  function startEditing() {
    posted.reset(update.photoDates);
    setDraft(update.content);
    setReactions(update.reactions.allowed);
    setAllowNotes(update.allowNotes);
    setStartAudience(choiceFor(update.audience));
    setAudience(choiceFor(update.audience));
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
          {label && <p className="text-sm text-muted-foreground">{label}</p>}
        </CardHeader>
        <CardContent className="text-base">
          {update.video ? (
            <VideoPlayer video={update.video} kind="update" authorName={update.authorName} />
          ) : editing ? (
            <EditorSlot>
              <RichEditor
                initial={update.content}
                slug={props.slug}
                photos={props.photos}
                onChange={setDraft}
                onPhotoDate={posted.onPhotoDate}
              />
            </EditorSlot>
          ) : (
            <RichText doc={update.content} />
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-2">
          {editing ? (
            <div className="w-full space-y-4">
              <PostSettings
                groups={props.groups}
                inviteOnly={props.inviteOnly}
                audience={audience}
                onAudience={setAudience}
                reactions={reactions}
                onReactions={setReactions}
                allowNotes={allowNotes}
                onAllowNotes={setAllowNotes}
                posted={
                  props.photos === "off"
                    ? undefined
                    : {
                        on: posted.on,
                        onOn: posted.setOn,
                        value: posted.value,
                        onValue: posted.setValue,
                        noneFound: posted.noneFound,
                        showField: true,
                      }
                }
                disabled={saving}
              >
                <Button
                  onClick={save}
                  disabled={saving || draft === null || posted.invalid || !canShare(audience, props.groups)}
                >
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
      <NoteDialog open={writing} onOpenChange={setWriting} slug={props.slug} name={props.name} isFamily={props.canEdit} onLeave={props.onLeaveNote} />
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
