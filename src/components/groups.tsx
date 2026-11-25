import { useState, type FormEvent } from "react";
import { Confirm, ErrorMessage, Field } from "@/components/page";
import { Radio } from "@/components/postSettings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../api.js";

// The People page's groups, as the server sends them to family members only.
export type GroupMember = { id: string; name: string; email: string; emailVerified: boolean; removed: boolean };
// onlyHere: how many updates are shared with this group and no other.
export type PeopleGroup = { id: string; name: string; members: GroupMember[]; onlyHere: number };
// A supporter who can be added: listed (so has an email) and not removed.
type Candidate = { id: string; name: string; email: string };

const MAX_NAME = 50;

function updates(count: number) {
  return count === 1 ? "1 update is" : `${count} updates are`;
}

// The Groups section's contents. Every change reloads the page's data, whether it worked or not,
// so the lists show what another family member changed meanwhile. Messages show here rather than
// at the top of the page, which is out of view this far down on a phone.
export function Groups({
  slug,
  groups,
  supporters,
  reload,
}: {
  slug: string;
  groups: PeopleGroup[];
  supporters: Candidate[];
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function change(path: string, method: string, body: unknown, done?: string): Promise<boolean> {
    const { status, data } = await api<{ error?: string }>(slug, path, { method, body });
    const ok = status < 300;
    if (!ok) setMessage({ text: data?.error ?? "Something went wrong. Please try again.", error: true });
    else setMessage(done ? { text: done, error: false } : null);
    await reload();
    return ok;
  }

  return (
    <>
      <p className="text-muted-foreground">
        Share an update with only some supporters by choosing groups in Post settings. Supporters never see group
        names or which groups they're in, and aren't told when they're added or removed. Groups also decide
        whose notes a supporter sees.
      </p>
      {message &&
        (message.error ? (
          <ErrorMessage>{message.text}</ErrorMessage>
        ) : (
          <Alert>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ))}
      <CreateGroup onCreate={(name) => change("groups", "POST", { name }, `Created ${name.trim()}.`)} />
      {groups.length === 0 ? (
        <p className="text-muted-foreground">No groups yet.</p>
      ) : (
        groups.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            others={groups.filter((o) => o.id !== g.id)}
            candidates={supporters.filter((s) => !g.members.some((m) => m.id === s.id))}
            change={(body, done) => change(`groups/${g.id}`, "PATCH", body, done)}
            onDelete={(moveTo) => change(`groups/${g.id}`, "DELETE", { moveTo }, `Deleted ${g.name}.`)}
            reload={reload}
          />
        ))
      )}
    </>
  );
}

function CreateGroup({ onCreate }: { onCreate: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (await onCreate(name)) setName("");
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a group</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={MAX_NAME} />
          </Field>
          <Button disabled={busy}>Create group</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function GroupCard({
  group,
  others,
  candidates,
  change,
  onDelete,
  reload,
}: {
  group: PeopleGroup;
  others: PeopleGroup[];
  candidates: Candidate[];
  change: (body: unknown, done?: string) => Promise<boolean>;
  onDelete: (moveTo: string[]) => Promise<boolean>;
  reload: () => Promise<void>;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  // Where the updates shared only with this group go: family members only, or the checked groups.
  const [deleting, setDeleting] = useState<{ mode: "family" | "groups"; ids: string[] } | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    await action();
    setBusy(false);
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (renaming === null) return;
    const name = renaming;
    await run(async () => {
      if (await change({ name }, `Renamed ${group.name} to ${name.trim()}.`)) setRenaming(null);
    });
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const person = candidates.find((c) => c.id === adding);
    if (!person) return;
    await run(async () => {
      if (await change({ add: person.id }, `Added ${person.name} to ${group.name}.`)) setAdding("");
    });
  }

  // Reloads first, so the count of updates shared only with this group is current.
  async function startDelete() {
    await run(reload);
    setDeleting({ mode: "family", ids: [] });
  }

  // Only groups that still exist, in case one was deleted while this was open.
  const moveTo = deleting?.mode === "groups" ? deleting.ids.filter((id) => others.some((o) => o.id === id)) : [];
  const radio = `delete-${group.id}`;

  return (
    <Card>
      <CardHeader>
        {renaming === null ? (
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="min-w-0 flex-1 break-words">{group.name}</CardTitle>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRenaming(group.name)}>
              Rename
            </Button>
            <Button variant="ghost" size="sm" disabled={busy || deleting !== null} onClick={startDelete}>
              Delete
            </Button>
          </div>
        ) : (
          <form onSubmit={rename} className="space-y-3">
            <Field label={`New name for ${group.name}`}>
              <Input
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                required
                maxLength={MAX_NAME}
                autoFocus
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy}>Save name</Button>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {group.members.length === 0 ? (
          <p className="text-muted-foreground">No members yet.</p>
        ) : (
          <ul className="divide-y">
            {group.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words">{m.name}</span>
                    {!m.emailVerified && <Tag>Not verified</Tag>}
                    {m.removed && <Tag>Removed</Tag>}
                  </div>
                  <div className="text-sm break-all text-muted-foreground">{m.email}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => change({ remove: m.id }, `Removed ${m.name} from ${group.name}.`))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {candidates.length > 0 && (
          <form onSubmit={add} className="flex flex-wrap items-end gap-2">
            <Label className="min-w-0 flex-1 flex-col items-start gap-2 leading-normal">
              Add a member
              <select
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              >
                <option value="">Choose a supporter</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </Label>
            <Button disabled={busy || adding === ""}>Add</Button>
          </form>
        )}

        {deleting && (
          <Confirm
            yes="Yes, delete"
            disabled={busy || (deleting.mode === "groups" && moveTo.length === 0)}
            onYes={() =>
              run(async () => {
                if (await onDelete(moveTo)) setDeleting(null);
              })
            }
            onCancel={() => setDeleting(null)}
          >
            {group.onlyHere === 0 ? (
              <p>Delete {group.name}? No update is shared only with this group.</p>
            ) : (
              <fieldset className="space-y-3 pb-1">
                <legend className="mb-3">
                  Delete {group.name}? {updates(group.onlyHere)} shared only with {group.name}. Who should see{" "}
                  {group.onlyHere === 1 ? "it" : "them"}?
                </legend>
                <Label>
                  <Radio
                    name={radio}
                    checked={deleting.mode === "family"}
                    onChange={() => setDeleting({ ...deleting, mode: "family" })}
                  />
                  Family members only
                </Label>
                {others.length > 0 && (
                  <Label>
                    <Radio
                      name={radio}
                      checked={deleting.mode === "groups"}
                      onChange={() => setDeleting({ ...deleting, mode: "groups" })}
                    />
                    Other groups
                  </Label>
                )}
                {deleting.mode === "groups" && (
                  <div className="space-y-3 pl-6">
                    {others.map((o) => (
                      <Label key={o.id} className="leading-snug">
                        <Checkbox
                          checked={deleting.ids.includes(o.id)}
                          onCheckedChange={(checked) =>
                            setDeleting({
                              ...deleting,
                              ids: checked === true ? [...deleting.ids, o.id] : deleting.ids.filter((x) => x !== o.id),
                            })
                          }
                        />
                        <span className="min-w-0 break-words">{o.name}</span>
                      </Label>
                    ))}
                  </div>
                )}
              </fieldset>
            )}
          </Confirm>
        )}
      </CardContent>
    </Card>
  );
}

function Tag({ children }: { children: string }) {
  return <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{children}</span>;
}
