import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { api } from "../api.js";
import { linkify } from "../linkify.js";
import { REACTIONS, summary, whoReacted, type Reactions as ReactionsData } from "../reactions.js";

type Update = {
  id: string;
  body: string;
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
      {canEdit && <PostForm onPost={(body, notify) => change("updates", "POST", { body, notify })} />}
      {error && <p className="error">{error}</p>}
      {updates?.length === 0 && <p>No updates yet.</p>}
      {updates?.map((update) => (
        <UpdateItem
          key={update.id}
          update={update}
          canEdit={canEdit}
          onEdit={(body) => change(`updates/${update.id}`, "PATCH", { body })}
          onDelete={() => change(`updates/${update.id}`, "DELETE")}
          onReact={(kind) => change("reactions", "POST", { updateId: update.id, kind })}
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
    <form onSubmit={submit}>
      <h2>Post an update</h2>
      <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      <p>
        <label>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify
          supporters by email
        </label>
      </p>
      <button disabled={posting || !body.trim()}>Post</button>
    </form>
  );
}

function UpdateItem(props: {
  update: Update;
  canEdit: boolean;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onReact: (kind: string | null) => Promise<boolean>;
}) {
  const { update } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    if (await props.onEdit(draft)) setDraft(null);
    setSaving(false);
  }

  function remove() {
    if (confirm("Delete this update? This can't be undone.")) props.onDelete();
  }

  return (
    <article>
      <hr />
      <p>
        <strong>{update.authorName}</strong> · {new Date(update.createdAt).toLocaleString()}
        {update.editedAt && " · edited"}
      </p>
      {draft === null ? (
        <p style={{ whiteSpace: "pre-wrap" }}>
          {linkify(update.body).map((segment, i) =>
            "href" in segment ? (
              <a key={i} href={segment.href} target="_blank" rel="noopener noreferrer">
                {segment.href}
              </a>
            ) : (
              segment.text
            ),
          )}
        </p>
      ) : (
        <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
      )}
      {props.canEdit &&
        (draft === null ? (
          <p>
            <button onClick={() => setDraft(update.body)}>Edit</button>{" "}
            <button onClick={remove}>Delete</button>
          </p>
        ) : (
          <p>
            <button onClick={save} disabled={saving || !draft.trim()}>
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

// A React button that opens a tray of the six emoji, and a summary ("7 Reacted: ❤️🙏😂")
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
              className="link"
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
