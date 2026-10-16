import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
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
    <section>
      {canEdit && <PostForm onPost={(blocks, notify) => change("updates", "POST", { blocks, notify })} />}
      {error && <p className="error">{error}</p>}
      {updates?.length === 0 && <p>No updates yet.</p>}
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
    <div className="blocks">
      {draft.map((d) => (
        <div key={d.key}>
          <textarea
            rows={6}
            value={d.text}
            onChange={(e) => onChange(draft.map((x) => (x.key === d.key ? { ...x, text: e.target.value } : x)))}
          />
          {draft.length > 1 && (
            <button type="button" onClick={() => onChange(draft.filter((x) => x.key !== d.key))}>
              Remove
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...draft, ...draftOf([""])])}>
        Add text
      </button>
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
    <form onSubmit={submit}>
      <h2>Post an update</h2>
      <BlockEditor draft={draft} onChange={setDraft} />
      <p>
        <label>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify
          supporters by email
        </label>
      </p>
      <button disabled={posting || blocksOf(draft).length === 0}>Post</button>
    </form>
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
      <hr />
      <p>
        <strong>{update.authorName}</strong> · {new Date(update.createdAt).toLocaleString()}
        {update.editedAt && " · edited"}
      </p>
      {draft === null ? (
        update.blocks.map((block, i) => (
          <p key={i} style={{ whiteSpace: "pre-wrap" }}>
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
        ))
      ) : (
        <BlockEditor draft={draft} onChange={setDraft} />
      )}
      {props.canEdit &&
        (draft === null ? (
          <>
            <p>
              <button onClick={() => setDraft(draftOf(update.blocks.map((b) => b.text)))}>Edit</button>{" "}
              <button onClick={() => setConfirmingDelete(true)}>Delete</button>
            </p>
            {confirmingDelete && (
              <p>
                Delete this update? This can't be undone.{" "}
                <button
                  onClick={() => {
                    setConfirmingDelete(false);
                    props.onDelete();
                  }}
                >
                  Yes, delete
                </button>{" "}
                <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
              </p>
            )}
          </>
        ) : (
          <p>
            <button onClick={save} disabled={saving || blocksOf(draft).length === 0}>
              Save
            </button>{" "}
            <button onClick={() => setDraft(null)}>Cancel</button>
          </p>
        ))}
      <Reactions update={update} onReact={props.onReact} />
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
      <div className="reactions">
        <span className="react" ref={area} onPointerEnter={(e) => hoverTray(e, true)} onPointerLeave={(e) => hoverTray(e, false)}>
          <button
            ref={button}
            className={mine ? "react-button mine" : "react-button"}
            aria-label={mine ? `Your reaction: ${mine.name}. Change it` : "React"}
            aria-expanded={tray}
            disabled={pending}
            onClick={() => {
              window.clearTimeout(timer.current);
              setTray(true);
            }}
          >
            {mine ? mine.emoji : "React"}
          </button>
          {tray && (
            <span className="tray" role="group" aria-label="Pick a reaction">
              {REACTIONS.map((x) => (
                <button key={x.kind} aria-label={x.name} aria-pressed={x.kind === r.mine} onClick={() => pick(x.kind)}>
                  {x.emoji}
                </button>
              ))}
            </span>
          )}
        </span>
        {r.count > 0 && (
          <span
            className="summary"
            onPointerEnter={(e) => e.pointerType === "mouse" && setNames((n) => (n === "pinned" ? n : "hover"))}
            onPointerLeave={() => setNames((n) => (n === "hover" ? "closed" : n))}
          >
            <button
              className="plain"
              aria-label={summaryLabel(r)}
              aria-expanded={names === "pinned"}
              onClick={() => setNames((n) => (n === "pinned" ? "closed" : "pinned"))}
            >
              {summary(r)}
            </button>
            {names === "hover" && <NameList r={r} className="popover" />}
          </span>
        )}
      </div>
      {names === "pinned" && <NameList r={r} className="names" />}
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
