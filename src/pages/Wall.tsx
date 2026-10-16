import { useEffect, useState } from "react";
import { ErrorMessage, PageShell } from "@/components/page";
import { NoteCard } from "@/components/notes";
import { Button } from "@/components/ui/button";
import { api, type Me } from "../api.js";
import type { Note } from "../notes.js";

// Every note in the family, newest first, in columns. Anyone not signed in goes to the family's
// home page, which shows the gate.
export function Wall({ slug }: { slug: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState("");

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

  async function remove(id: string): Promise<boolean> {
    setError("");
    const { status, data } = await api<{ error?: string }>(slug, `notes/${id}`, { method: "DELETE" });
    if (status >= 300) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return false;
    }
    await load();
    return true;
  }

  if (error && !me) return <PageShell title="Notes">{<ErrorMessage>{error}</ErrorMessage>}</PageShell>;
  if (!me || !notes) return null;
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
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {notes.length === 0 ? (
        <p className="text-muted-foreground">No notes yet. Leave one on any update.</p>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canDelete={me.person.role === "family" || note.mine}
              onDelete={() => remove(note.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
