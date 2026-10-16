import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FamilyShell, PageTitle } from "@/components/familyShell";
import { Confirm, ErrorMessage, Field, PageShell } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, type Me } from "../api.js";
import { NotFound } from "./NotFound.js";

type Supporter = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  notificationsOn: boolean;
  joinedAt: string;
  removedAt: string | null;
};
type FamilyMember = { id: string; name: string; email: string; isYou: boolean };
type People = {
  familyMembers: FamilyMember[];
  supporters: Supporter[];
  removed: Supporter[];
  devicesWithoutVerifiedEmail: number;
  question: string;
  acceptedAnswers: string[];
};

function date(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function devices(count: number) {
  return count === 1 ? "1 device" : `${count} devices`;
}

// Family members' page for family members, supporters, and the community question. The server
// refuses the data to anyone else; this page only shows what it's given.
export function People({ slug }: { slug: string }) {
  const [people, setPeople] = useState<People | "loading" | "forbidden" | "signed-out" | "not-found">("loading");
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>(slug, "me").then(({ status, data }) => status === 200 && setMe(data));
  }, [slug]);

  function load() {
    api<People>(slug, "people").then(({ status, data }) => {
      if (status === 200) {
        setPeople(data);
        setQuestion(data.question);
        setAnswers(data.acceptedAnswers.join("\n"));
      } else setPeople(status === 404 ? "not-found" : status === 403 ? "forbidden" : "signed-out");
    });
  }

  useEffect(load, [slug]);

  async function setRemoved(person: { id: string }, removed: boolean) {
    const { status, data } = await api<{ error?: string }>(slug, `people/${person.id}`, {
      method: "PATCH",
      body: { removed },
    });
    if (status !== 200) return setMessage({ text: data?.error ?? "Something went wrong. Please try again.", error: true });
    setMessage(null);
    load();
  }

  async function verify(s: Supporter) {
    const { status, data } = await api<{ error?: string }>(slug, `people/${s.id}`, {
      method: "PATCH",
      body: { verified: true },
    });
    setMessage(
      status === 200
        ? { text: `Verified ${s.name}'s email.`, error: false }
        : { text: data?.error ?? "Something went wrong. Please try again.", error: true },
    );
    if (status === 200) load();
  }

  async function addFamilyMember(name: string, email: string): Promise<boolean> {
    const { status, data } = await api<{ name: string; outcome: string; error?: string }>(slug, "people", {
      method: "POST",
      body: { name, email },
    });
    if (status !== 200) {
      setMessage({ text: data?.error ?? "Something went wrong. Please try again.", error: true });
      return false;
    }
    setMessage({
      text:
        data.outcome === "promoted"
          ? `Moved ${data.name} from supporters to family members. They'll get an email to sign in.`
          : `Added ${data.name}. They'll get an email to sign in.`,
      error: false,
    });
    load();
    return true;
  }

  async function addSupporter(name: string, email: string): Promise<boolean> {
    const { status, data } = await api<{ name: string; error?: string }>(slug, "supporters", {
      method: "POST",
      body: { name, email },
    });
    if (status !== 200) {
      setMessage({ text: data?.error ?? "Something went wrong. Please try again.", error: true });
      return false;
    }
    setMessage({ text: `Added ${data.name}. They'll get an email to confirm.`, error: false });
    load();
    return true;
  }

  async function saveQuestion(e: FormEvent) {
    e.preventDefault();
    const { status, data } = await api<{ signedOut?: number; error?: string }>(slug, "question", {
      method: "PUT",
      body: { question, answers: answers.split("\n") },
    });
    const signedOut = data?.signedOut ?? 0;
    setMessage(
      status === 200
        ? {
            text: signedOut > 0 ? `Question saved. Signed out ${devices(signedOut)} without a verified email.` : "Question saved.",
            error: false,
          }
        : { text: data?.error ?? "Something went wrong. Please try again.", error: true },
    );
    if (status === 200) load();
  }

  if (people === "loading") return null;
  if (people === "not-found") return <NotFound />;
  if (people === "signed-out" || people === "forbidden") {
    return (
      <PageShell title="People">
        <p>Only family members can see this page.</p>
        <p>
          <a href={`/f/${slug}`}>Back to updates</a>
        </p>
      </PageShell>
    );
  }
  if (!me) return null;
  return (
    <FamilyShell slug={slug} me={me} page="people" column>
      <PageTitle>People</PageTitle>
      {message &&
        (message.error ? (
          <ErrorMessage>{message.text}</ErrorMessage>
        ) : (
          <Alert>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ))}

      <FamilyMembers
        members={people.familyMembers}
        onRemove={(m) => setRemoved(m, true)}
        onAdd={addFamilyMember}
      />

      <Section title={`Supporters (${people.supporters.length})`}>
        {people.devicesWithoutVerifiedEmail > 0 && (
          <p className="text-muted-foreground">
            Signed in without a verified email: {devices(people.devicesWithoutVerifiedEmail)}, including anyone reading
            without giving an email, whom you can't see here. Removing or changing an accepted answer (below) signs them
            all out.
          </p>
        )}
        <AddSupporter onAdd={addSupporter} />
        {people.supporters.length === 0 ? (
          <p className="text-muted-foreground">No supporters have given an email yet.</p>
        ) : (
          <SupporterTable
            rows={people.supporters}
            action="Remove"
            confirm={(s) =>
              `Remove ${s.name}? They'll be signed out, and this email can't be used here again. If they know the answer, they can still read without an email until you change it.`
            }
            onAction={(s) => setRemoved(s, true)}
            onVerify={verify}
          />
        )}
      </Section>

      {people.removed.length > 0 && (
        <Section title={`Removed (${people.removed.length})`}>
          <p className="text-muted-foreground">
            Removed supporters can't sign in or give their email again. Restoring lets them sign in again, with
            notifications off.
          </p>
          <SupporterTable rows={people.removed} action="Restore" onAction={(s) => setRemoved(s, false)} />
        </Section>
      )}

      <Section title="Community question">
        <p className="text-muted-foreground">
          Anyone who answers this can read the updates. Removing or changing an accepted answer signs out everyone
          without a verified email ({devices(people.devicesWithoutVerifiedEmail)} right now); supporters with a verified
          email stay signed in. Adding an answer or rewording the question signs no one out. If someone you don't
          recognize got in, remove them <em>and</em> change the answer.
        </p>
        <Card>
          <CardContent>
            <form onSubmit={saveQuestion} className="space-y-4">
              <Field label="Question">
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} required maxLength={500} />
              </Field>
              <Field label={'Accepted answers, one per line (capitals and a leading "the" don\'t matter)'}>
                <Textarea value={answers} onChange={(e) => setAnswers(e.target.value)} required rows={4} />
              </Field>
              <Button>Save question</Button>
            </form>
          </CardContent>
        </Card>
      </Section>
    </FamilyShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 pt-4">
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

function FamilyMembers({
  members,
  onRemove,
  onAdd,
}: {
  members: FamilyMember[];
  onRemove: (m: FamilyMember) => void;
  onAdd: (name: string, email: string) => Promise<boolean>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmingAdd, setConfirmingAdd] = useState(false);

  async function add() {
    setConfirmingAdd(false);
    if (await onAdd(name, email)) {
      setName("");
      setEmail("");
    }
  }

  const removingMember = members.find((m) => m.id === removing);
  return (
    <Section title={`Family members (${members.length})`}>
      <Table>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.isYou ? `${m.name} (you)` : m.name}</TableCell>
              <TableCell>{m.email}</TableCell>
              <TableCell className="text-right">
                {!m.isYou && (
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(m.id)}>
                    Remove
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {removingMember && (
        <Confirm
          yes="Yes, remove"
          onYes={() => {
            setRemoving(null);
            onRemove(removingMember);
          }}
          onCancel={() => setRemoving(null)}
        >
          Remove {removingMember.name}? They'll be signed out and can no longer see or post updates.
        </Confirm>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a family member</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirmingAdd(true);
            }}
            className="space-y-4"
          >
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            {confirmingAdd ? (
              <Confirm yes="Yes, add" onYes={add} onCancel={() => setConfirmingAdd(false)}>
                Add {name} ({email}) as a family member? They'll be able to post, edit, and delete updates and see all
                supporters.
              </Confirm>
            ) : (
              <Button>Add</Button>
            )}
          </form>
        </CardContent>
      </Card>
    </Section>
  );
}

// Adds one supporter. They get a welcome email, and no notifications until they confirm it.
function AddSupporter({ onAdd }: { onAdd: (name: string, email: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (await onAdd(name, email)) {
      setName("");
      setEmail("");
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a supporter</CardTitle>
        <CardDescription>Double-check the email: whoever owns it will be able to read the updates.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button disabled={busy}>Add supporter</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SupporterTable({
  rows,
  action,
  confirm,
  onAction,
  onVerify,
}: {
  rows: Supporter[];
  action: string;
  confirm?: (s: Supporter) => string;
  onAction: (s: Supporter) => void;
  onVerify?: (s: Supporter) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const showRemoved = rows.some((r) => r.removedAt);
  const confirmingRow = rows.find((r) => r.id === confirming);
  // The table scrolls sideways on its own on narrow phones, so the page itself never does. The
  // confirmation sits below it, so it stays in view.
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Verified</TableHead>
            <TableHead>Notifications</TableHead>
            <TableHead>Joined</TableHead>
            {showRemoved && <TableHead>Removed</TableHead>}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.name}</TableCell>
              <TableCell>{s.email}</TableCell>
              <TableCell>
                {s.emailVerified ? (
                  "Yes"
                ) : (
                  <span className="flex items-center gap-2">
                    Not yet
                    {onVerify && (
                      <Button variant="outline" size="xs" onClick={() => onVerify(s)}>
                        Verify
                      </Button>
                    )}
                  </span>
                )}
              </TableCell>
              <TableCell>{s.notificationsOn ? "On" : "Off"}</TableCell>
              <TableCell>{date(s.joinedAt)}</TableCell>
              {s.removedAt && <TableCell>{date(s.removedAt)}</TableCell>}
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => (confirm ? setConfirming(s.id) : onAction(s))}>
                  {action}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {confirm && confirmingRow && (
        <Confirm
          yes={`Yes, ${action.toLowerCase()}`}
          onYes={() => {
            setConfirming(null);
            onAction(confirmingRow);
          }}
          onCancel={() => setConfirming(null)}
        >
          {confirm(confirmingRow)}
        </Confirm>
      )}
    </>
  );
}
