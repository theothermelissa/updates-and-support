import { useEffect, useState, type FormEvent } from "react";
import { Confirm, ErrorMessage } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    <section className="space-y-6">
      {canEdit && <PostForm onPost={(body, notify) => change("updates", "POST", { body, notify })} />}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {updates?.length === 0 && <p className="text-muted-foreground">No updates yet.</p>}
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
    <Card>
      <CardHeader>
        <CardTitle>Post an update</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Textarea className="min-h-32" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Update" />
          <Label>
            <Checkbox checked={notify} onCheckedChange={(checked) => setNotify(checked === true)} />
            Notify supporters by email
          </Label>
          <Button disabled={posting || !body.trim()}>Post</Button>
        </form>
      </CardContent>
    </Card>
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    if (draft === null) return;
    setSaving(true);
    if (await props.onEdit(draft)) setDraft(null);
    setSaving(false);
  }

  return (
    <article>
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{update.authorName}</span> ·{" "}
            {new Date(update.createdAt).toLocaleString()}
            {update.editedAt && " · edited"}
          </p>
        </CardHeader>
        <CardContent className="text-base">
          {draft === null ? (
            <p className="break-words whitespace-pre-wrap">
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
            <Textarea className="min-h-32" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Update" />
          )}
        </CardContent>
        {props.canEdit && (
          <CardFooter className="flex flex-wrap items-center gap-2 border-t py-3">
            {draft !== null ? (
              <>
                <Button onClick={save} disabled={saving || !draft.trim()}>
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
                <Button variant="outline" onClick={() => setDraft(update.body)}>
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
