import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PageTitle } from "@/components/familyShell";
import { Confirm, EmailInput, ErrorMessage, Field, PhoneLink } from "@/components/page";
import { ReactionChooser } from "@/components/postSettings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../api.js";
import { MAX_PRIVACY_NOTICE, STANDARD_PRIVACY_NOTICE } from "../lib/privacyNotice.js";
import { isUsual } from "../lib/reactionCatalog.js";
import { followLink } from "../navigate.js";
import type { FamilyPageProps } from "./FamilyFrame.js";
import { NotFound } from "./NotFound.js";

type Supporter = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
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
  noteReactions: string[];
  allowNotesByDefault: boolean;
  privacyNotice: string | null;
};

function date(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function devices(count: number) {
  return count === 1 ? "1 device" : `${count} devices`;
}

// Family members' page for family members, supporters, note reactions, notes on new updates, the privacy banner, and the community question. The server
// refuses the data to anyone else; this page only shows what it's given.
export function People({ slug, home, me, reloadMe }: FamilyPageProps) {
  const [people, setPeople] = useState<People | "loading" | "forbidden" | "signed-out" | "not-found">("loading");
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState("");
  const [noteReactions, setNoteReactions] = useState<string[]>([]);
  const [choosingNoteReactions, setChoosingNoteReactions] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [allowNotesByDefault, setAllowNotesByDefault] = useState(true);
  // Shown beside the checkbox, since it saves on its own without a button.
  const [notesDefaultStatus, setNotesDefaultStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [privacyNotice, setPrivacyNotice] = useState("");
  // Shown beside the button, near the box, since the page's own message sits at the top.
  const [privacyNoticeStatus, setPrivacyNoticeStatus] = useState<{ text: string; error: boolean } | null>(null);

  function load() {
    api<People>(slug, "people").then(({ status, data }) => {
      if (status === 200) {
        setPeople(data);
        setQuestion(data.question);
        setAnswers(data.acceptedAnswers.join("\n"));
        setNoteReactions(data.noteReactions);
        setChoosingNoteReactions(!isUsual(data.noteReactions));
        setAllowNotesByDefault(data.allowNotesByDefault);
        setPrivacyNotice(data.privacyNotice ?? "");
      } else setPeople(status === 404 ? "not-found" : status === 403 ? "forbidden" : "signed-out");
    });
  }

  // Again when the reader's name changes, since the family members list shows it.
  useEffect(load, [slug, me.person.name]);

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

  async function saveNoteReactions(e: FormEvent) {
    e.preventDefault();
    const { status, data } = await api<{ reactions?: string[]; error?: string }>(slug, "note-reactions", {
      method: "PUT",
      body: { reactions: noteReactions },
    });
    if (status === 200 && data?.reactions) {
      setNoteReactions(data.reactions);
      setMessage({ text: "Note reactions saved.", error: false });
    } else setMessage({ text: data?.error ?? "Something went wrong. Please try again.", error: true });
  }

  // Saves at once; on failure the checkbox goes back to the saved value.
  async function saveNotesDefault(allow: boolean) {
    const before = allowNotesByDefault;
    setAllowNotesByDefault(allow);
    setNotesDefaultStatus(null);
    const { status, data } = await api<{ allowNotesByDefault?: boolean; error?: string }>(slug, "notes-default", {
      method: "PUT",
      body: { allowNotesByDefault: allow },
    });
    if (status === 200 && typeof data?.allowNotesByDefault === "boolean") {
      setAllowNotesByDefault(data.allowNotesByDefault);
      setNotesDefaultStatus({ text: "Saved", error: false });
    } else {
      setAllowNotesByDefault(before);
      setNotesDefaultStatus({ text: data?.error ?? "Couldn't save. Please try again.", error: true });
    }
  }

  // Reloads who is signed in afterward, so the banner at the top shows the new wording at once.
  async function savePrivacyNotice(e: FormEvent) {
    e.preventDefault();
    setPrivacyNoticeStatus(null);
    const { status, data } = await api<{ privacyNotice?: string | null; error?: string }>(slug, "privacy-notice", {
      method: "PUT",
      body: { privacyNotice },
    });
    if (status === 200 && data?.privacyNotice !== undefined) {
      setPrivacyNotice(data.privacyNotice ?? "");
      setPrivacyNoticeStatus({ text: "Saved", error: false });
      reloadMe();
    } else setPrivacyNoticeStatus({ text: data?.error ?? "Couldn't save. Please try again.", error: true });
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
      <>
        <p>Only family members can see this page.</p>
        <p>
          <a href={home} onClick={followLink}>
            Back to updates
          </a>
        </p>
      </>
    );
  }
  return (
    <>
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

      <Section title="Reactions on notes">
        <p className="text-muted-foreground">
          The emoji everyone can use to react to notes, including supporters' notes to you. Changing them keeps
          reactions already given.
        </p>
        <Card>
          <CardContent>
            <form onSubmit={saveNoteReactions} className="space-y-4">
              <ReactionChooser
                reactions={noteReactions}
                onReactions={setNoteReactions}
                choosing={choosingNoteReactions}
                onChoosing={setChoosingNoteReactions}
              />
              <Button>Save reactions</Button>
            </form>
          </CardContent>
        </Card>
      </Section>

      <Section title="Notes on new updates">
        <p className="text-muted-foreground">
          Whether new updates start out allowing notes. You can still change it for each update in Post settings.
        </p>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Label>
              <Checkbox checked={allowNotesByDefault} onCheckedChange={(checked) => saveNotesDefault(checked === true)} />
              New updates allow notes
            </Label>
            {notesDefaultStatus && (
              <span
                className={notesDefaultStatus.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
                role="status"
              >
                {notesDefaultStatus.text}
              </span>
            )}
          </CardContent>
        </Card>
      </Section>

      <Section title="Privacy banner">
        <p className="text-muted-foreground">
          Shown across the top of every page to everyone signed in. Leave it empty to use the standard wording: “
          {STANDARD_PRIVACY_NOTICE}”
        </p>
        <Card>
          <CardContent>
            <form onSubmit={savePrivacyNotice} className="space-y-4">
              <Textarea
                aria-label="Privacy banner"
                value={privacyNotice}
                onChange={(e) => setPrivacyNotice(e.target.value)}
                maxLength={MAX_PRIVACY_NOTICE}
                rows={3}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button>Save banner</Button>
                {privacyNoticeStatus && (
                  <span
                    className={privacyNoticeStatus.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
                    role="status"
                  >
                    {privacyNoticeStatus.text}
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </Section>

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
    </>
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
              <EmailInput value={email} onChange={(e) => setEmail(e.target.value)} required />
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
            <EmailInput value={email} onChange={(e) => setEmail(e.target.value)} required />
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
            <TableHead>Phone</TableHead>
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
              <TableCell className="whitespace-nowrap">{s.phone && <PhoneLink phone={s.phone} />}</TableCell>
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
