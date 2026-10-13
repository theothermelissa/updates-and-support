import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api.js";
import { linkify } from "../linkify.js";

type Update = { id: string; body: string; authorName: string; createdAt: string; editedAt: string | null };

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
    </article>
  );
}
