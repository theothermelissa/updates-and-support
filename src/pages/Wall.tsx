import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorMessage, PageShell } from "@/components/page";
import { NoteCard } from "@/components/notes";
import { Button } from "@/components/ui/button";
import { api, type Me } from "../api.js";
import type { Note } from "../notes.js";

type UpdateSummary = { id: string; body: string; authorName: string; createdAt: string };

// The update named after "#update=" in the address, if any. It sits after the "#" because
// preview logins drop query strings.
function updateInAddress(): string | null {
  return new URLSearchParams(location.hash.slice(1)).get("update");
}

// Every note in the family, newest first, in columns. An update's "See all" link narrows it to
// that update's notes, which a bar above them says, with a way back to every note. Anyone not
// signed in goes to the family's home page, which shows the gate.
export function Wall({ slug }: { slug: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [updates, setUpdates] = useState<UpdateSummary[]>([]);
  const [filter, setFilter] = useState(updateInAddress);
  const [error, setError] = useState("");

  useEffect(() => {
    const follow = () => setFilter(updateInAddress());
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  // Only needed to name the update the wall is narrowed to.
  useEffect(() => {
    if (!filter || updates.length > 0) return;
    api<{ updates: UpdateSummary[] }>(slug, "updates").then(({ status, data }) => {
      if (status === 200) setUpdates(data.updates);
    });
  }, [slug, filter]);

  function showAll() {
    history.pushState(null, "", location.pathname);
    setFilter(null);
  }

  async function load() {
    const [who, list] = await Promise.all([api<Me>(slug, "me"), api<{ notes: Note[] }>(slug, "notes")]);
    if (who.status === 401 || list.status === 401) return location.replace(`/f/${slug}`);
    if (who.status !== 200 || list.status !== 200) return setError("Couldn't load the notes. Please refresh the page.");
    setMe(who.data);
    setNotes(list.data.notes);
  }

  useEffect(() => {
    load();
  }, [slug]);

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

  function remove(id: string): Promise<boolean> {
    return change(`notes/${id}`, "DELETE");
  }

  function react(id: string, kind: string | null): Promise<boolean> {
    return change("reactions", "POST", { noteId: id, kind });
  }

  if (error && !me) return <PageShell title="Notes">{<ErrorMessage>{error}</ErrorMessage>}</PageShell>;
  if (!me || !notes) return null;
  const shown = filter ? notes.filter((n) => n.updateId === filter) : notes;
  const update = updates.find((u) => u.id === filter);
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes of support</h1>
          <p className="text-sm text-muted-foreground">{me.family.displayName}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`/f/${slug}`}>Back to updates</a>
        </Button>
      </header>
      {filter && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          <p className="min-w-0">
            Showing {shown.length === 1 ? "the 1 note" : `all ${shown.length} notes`} on{" "}
            {update ? (
              <>
                {update.authorName}'s update from {new Date(update.createdAt).toLocaleDateString()}:{" "}
                <span className="text-muted-foreground">"{excerpt(update.body)}"</span>
              </>
            ) : (
              "one update"
            )}
          </p>
          <Button variant="outline" size="sm" onClick={showAll}>
            <XIcon />
            Show all notes
          </Button>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {shown.length === 0 ? (
        <p className="text-muted-foreground">
          {filter ? "This update has no notes." : "No notes yet. Leave one on any update."}
        </p>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {shown.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canDelete={me.person.role === "family" || note.mine}
              onDelete={() => remove(note.id)}
              onReact={(kind) => react(note.id, kind)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function excerpt(text: string): string {
  const line = text.split("\n")[0]!.trim();
  return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line;
}
