import { useState, type FormEvent } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "cn";
import { Confirm, ErrorMessage, Field, LinkedText } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COLORS, MAX_NOTE, PALETTE, randomColor, type Note, type NoteColor } from "../notes.js";

// A note as a card in its color, signed by its author, with Delete for those allowed.
export function NoteCard(props: { note: Note; canDelete: boolean; onDelete: () => Promise<boolean> }) {
  const { note } = props;
  const [confirming, setConfirming] = useState(false);
  const colors = PALETTE[note.color];
  return (
    <article
      className="break-inside-avoid space-y-3 rounded-xl border p-4 text-base"
      style={{ backgroundColor: colors.fill, color: colors.text, borderColor: `${colors.text}33` }}
    >
      <LinkedText text={note.body} className="font-medium [&_a]:text-inherit" />
      <p className="text-sm">
        — {note.authorName}
        {note.authorIsFamily && (
          <span className="ml-2 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: `${colors.text}66` }}>
            Family
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
        <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time>
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
    </article>
  );
}

export type NoteDraft = { body: string; color: NoteColor; name?: string };

// The "Leave a note" dialog. Starts in a random color. Shows the viewer's name read-only, or
// asks for one from someone without it; a name is changed on their profile, never here. `onLeave` returns an error message, or null once the note is saved.
export function NoteDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  name: string | null;
  onOpenChange: (open: boolean) => void;
  onLeave: (draft: NoteDraft) => Promise<string | null>;
}) {
  const [body, setBody] = useState("");
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
    const failed = await props.onLeave({ body, color, ...(askName ? { name } : {}) });
    setBusy(false);
    if (failed) setError(failed);
    else props.onOpenChange(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Leave a note</DialogTitle>
        <DialogDescription>Everyone who reads these updates will see it, signed with your name.</DialogDescription>
      </DialogHeader>
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
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={busy || !body.trim() || (askName && !name.trim())}>Leave note</Button>
      </DialogFooter>
    </form>
  );
}
