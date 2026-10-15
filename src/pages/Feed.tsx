import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api.js";
import { linkify } from "../linkify.js";
import { REACTIONS, whoReacted } from "../reactions.js";

type Reaction = { kind: string; count: number; names: string[]; mine: boolean };
type Update = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
  reactions: Reaction[];
  reactors: { count: number; names: string[]; you: boolean };
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
          onReact={(kind, on) => change("reactions", "POST", { updateId: update.id, kind, on })}
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
  onReact: (kind: string, on: boolean) => Promise<boolean>;
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

// All six reactions as buttons, then a line naming who reacted that opens a list per reaction.
// Nothing depends on hovering; `title` only adds the names on a computer.
function Reactions({ update, onReact }: { update: Update; onReact: (kind: string, on: boolean) => Promise<boolean> }) {
  const [pending, setPending] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const given = (kind: string) => update.reactions.find((r) => r.kind === kind);

  async function press(kind: string) {
    setPending(kind);
    await onReact(kind, !given(kind)?.mine);
    setPending(null);
  }

  return (
    <>
      <p className="reactions">
        {REACTIONS.map(({ kind, emoji, label }) => {
          const r = given(kind);
          return (
            <button
              key={kind}
              className="reaction"
              aria-pressed={r?.mine ?? false}
              aria-label={r ? `${label}, ${r.count}` : label}
              title={r ? `${label}: ${whoReacted(r.names, r.mine, r.count)}` : label}
              disabled={pending !== null}
              onClick={() => press(kind)}
            >
              {emoji}
              {r && ` ${r.count}`}
            </button>
          );
        })}
      </p>
      {update.reactors.count > 0 && (
        <p>
          <button className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
            {whoReacted(update.reactors.names, update.reactors.you, update.reactors.count, 2)}
          </button>
        </p>
      )}
      {open && (
        <ul>
          {update.reactions.map((r) => {
            const { emoji, label } = REACTIONS.find((x) => x.kind === r.kind)!;
            return (
              <li key={r.kind}>
                {emoji} {label}: {whoReacted(r.names, r.mine, r.count)}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
