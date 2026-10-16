import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { Confirm, ErrorMessage } from "@/components/page";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../api.js";
import { linkify } from "../linkify.js";
import { REACTIONS, summary, summaryLabel, whoReacted, type Reactions as ReactionsData } from "../reactions.js";

type TextBlock = { type: "text"; text: string };

type Update = {
  id: string;
  blocks: TextBlock[];
  authorName: string;
  createdAt: string;
  editedAt: string | null;
  reactions: ReactionsData;
};

export function Feed({ slug, canEdit }: { slug: string; canEdit: boolean }) {
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

  return (
    <section className="space-y-6">
      {canEdit && <PostForm onPost={(blocks, notify) => change("updates", "POST", { blocks, notify })} />}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {updates?.length === 0 && <p className="text-muted-foreground">No updates yet.</p>}
      {updates?.map((update) => (
        <UpdateItem
          key={update.id}
          update={update}
          canEdit={canEdit}
          onEdit={(blocks) => change(`updates/${update.id}`, "PATCH", { blocks })}
          onDelete={() => change(`updates/${update.id}`, "DELETE")}
          onReact={(kind) => change("reactions", "POST", { updateId: update.id, kind })}
        />
      ))}
    </section>
  );
}

// The editor's text boxes, each with a key so removing one doesn't shift the others.
type Draft = { key: number; text: string }[];

let nextKey = 0;
function draftOf(texts: string[]): Draft {
  return texts.map((text) => ({ key: nextKey++, text }));
}

// What gets sent: empty text boxes are left out.
function blocksOf(draft: Draft): TextBlock[] {
  return draft.filter((d) => d.text.trim()).map((d) => ({ type: "text", text: d.text }));
}

// A column of text boxes, each with "Remove" while there's more than one, and "Add text".
function BlockEditor({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  return (
    <div className="space-y-3">
      {draft.map((d, i) => (
        <div key={d.key} className="space-y-1">
          <Textarea
            className="min-h-32"
            value={d.text}
            onChange={(e) => onChange(draft.map((x) => (x.key === d.key ? { ...x, text: e.target.value } : x)))}
            aria-label={draft.length > 1 ? `Text ${i + 1}` : "Update"}
          />
          {draft.length > 1 && (
            <Button type="button" variant="ghost" onClick={() => onChange(draft.filter((x) => x.key !== d.key))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...draft, ...draftOf([""])])}>
        Add text
      </Button>
    </div>
  );
}

function PostForm({ onPost }: { onPost: (blocks: TextBlock[], notify: boolean) => Promise<boolean> }) {
  const [draft, setDraft] = useState(() => draftOf([""]));
  const [notify, setNotify] = useState(true);
  const [posting, setPosting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPosting(true);
    if (await onPost(blocksOf(draft), notify)) {
      setDraft(draftOf([""]));
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
          <BlockEditor draft={draft} onChange={setDraft} />
          <Label>
            <Checkbox checked={notify} onCheckedChange={(checked) => setNotify(checked === true)} />
            Notify supporters by email
          </Label>
          <Button disabled={posting || blocksOf(draft).length === 0}>Post</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UpdateItem(props: {
  update: Update;
  canEdit: boolean;
  onEdit: (blocks: TextBlock[]) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onReact: (kind: string | null) => Promise<boolean>;
}) {
  const { update } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    if (await props.onEdit(blocksOf(draft))) setDraft(null);
    setSaving(false);
  }

  return (
    <article>
      {/* Visible overflow, so the reaction tray is never clipped by the card's edge. */}
      <Card className="overflow-visible">
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{update.authorName}</span> ·{" "}
            {new Date(update.createdAt).toLocaleString()}
            {update.editedAt && " · edited"}
          </p>
        </CardHeader>
        <CardContent className="text-base">
          {draft === null ? (
            <div className="space-y-4">
              {update.blocks.map((block, i) => (
                <p key={i} className="break-words whitespace-pre-wrap">
                  {linkify(block.text).map((segment, j) =>
                    "href" in segment ? (
                      <a key={j} href={segment.href} target="_blank" rel="noopener noreferrer">
                        {segment.href}
                      </a>
                    ) : (
                      segment.text
                    ),
                  )}
                </p>
              ))}
            </div>
          ) : (
            <BlockEditor draft={draft} onChange={setDraft} />
          )}
          <Reactions update={update} onReact={props.onReact} />
        </CardContent>
        {props.canEdit && (
          <CardFooter className="flex flex-wrap items-center gap-2 border-t py-3">
            {draft !== null ? (
              <>
                <Button onClick={save} disabled={saving || blocksOf(draft).length === 0}>
                  Save
                </Button>
                <Button variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </>
            ) : confirmingDelete ? (
              <Confirm yes="Yes, delete" onYes={props.onDelete} onCancel={() => setConfirmingDelete(false)}>
                Delete this update? This can't be undone.
              </Confirm>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDraft(draftOf(update.blocks.map((b) => b.text)))}>
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
