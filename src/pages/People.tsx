import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api } from "../api.js";
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
type People = { familyMembers: FamilyMember[]; supporters: Supporter[]; removed: Supporter[]; question: string; acceptedAnswers: string[] };

function date(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Family members' page for family members, supporters, and the community question. The server
// refuses the data to anyone else; this page only shows what it's given.
export function People({ slug }: { slug: string }) {
  const [people, setPeople] = useState<People | "loading" | "forbidden" | "signed-out" | "not-found">("loading");
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

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

  async function saveQuestion(e: FormEvent) {
    e.preventDefault();
    const { status, data } = await api<{ error?: string }>(slug, "question", {
      method: "PUT",
      body: { question, answers: answers.split("\n") },
    });
    setMessage(
      status === 200
        ? { text: "Question saved.", error: false }
        : { text: data?.error ?? "Something went wrong. Please try again.", error: true },
    );
    if (status === 200) load();
  }

  if (people === "loading") return null;
  if (people === "not-found") return <NotFound />;
  if (people === "signed-out" || people === "forbidden") {
    return (
      <main>
        <p>Only family members can see this page.</p>
        <p>
          <a href={`/f/${slug}`}>Back to updates</a>
        </p>
      </main>
    );
  }
  return (
    <main>
      <p>
        <a href={`/f/${slug}`}>Back to updates</a>
      </p>
      <h1>People</h1>
      {message && <p className={message.error ? "error" : undefined}>{message.text}</p>}

      <FamilyMembers
        members={people.familyMembers}
        onRemove={(m) => setRemoved(m, true)}
        onAdd={addFamilyMember}
      />

      <h2>Supporters ({people.supporters.length})</h2>
      {people.supporters.length === 0 ? (
        <p>No supporters have joined yet.</p>
      ) : (
        <SupporterTable
          rows={people.supporters}
          action="Remove"
          confirm={(s) => `Remove ${s.name}? They'll be signed out and can't rejoin with this email.`}
          onAction={(s) => setRemoved(s, true)}
        />
      )}

      {people.removed.length > 0 && (
        <>
          <h2>Removed ({people.removed.length})</h2>
          <p>Removed supporters can't sign in or rejoin with their email. Restoring lets them sign in again, with notifications off.</p>
          <SupporterTable rows={people.removed} action="Restore" onAction={(s) => setRemoved(s, false)} />
        </>
      )}

      <h2>Community question</h2>
      <p>
        New supporters answer this to join. Changing it doesn't sign anyone out. If someone you don't recognize got in,
        remove them <em>and</em> change the question.
      </p>
      <form onSubmit={saveQuestion}>
        <p>
          <label>
            Question
            <br />
            <input value={question} onChange={(e) => setQuestion(e.target.value)} required maxLength={500} size={50} />
          </label>
        </p>
        <p>
          <label>
            Accepted answers, one per line (capitals and a leading "the" don't matter)
            <br />
            <textarea value={answers} onChange={(e) => setAnswers(e.target.value)} required rows={4} cols={50} />
          </label>
        </p>
        <button>Save question</button>
      </form>
    </main>
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

  return (
    <>
      <h2>Family members ({members.length})</h2>
      <div style={{ overflowX: "auto" }}>
        <table>
          <tbody>
            {members.map((m) => (
              <Fragment key={m.id}>
                <tr>
                  <td>{m.isYou ? `${m.name} (you)` : m.name}</td>
                  <td>{m.email}</td>
                  <td>{!m.isYou && <button onClick={() => setRemoving(m.id)}>Remove</button>}</td>
                </tr>
                {removing === m.id && (
                  <tr>
                    <td colSpan={3}>
                      Remove {m.name}? They'll be signed out and can no longer see or post updates.{" "}
                      <button
                        onClick={() => {
                          setRemoving(null);
                          onRemove(m);
                        }}
                      >
                        Yes, remove
                      </button>{" "}
                      <button onClick={() => setRemoving(null)}>Cancel</button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Add a family member</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setConfirmingAdd(true);
        }}
      >
        <p>
          <label>
            Name <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </label>
        </p>
        <p>
          <label>
            Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        </p>
        {confirmingAdd ? (
          <p>
            Add {name} ({email}) as a family member? They'll be able to post, edit, and delete updates and see all
            supporters.{" "}
            <button type="button" onClick={add}>
              Yes, add
            </button>{" "}
            <button type="button" onClick={() => setConfirmingAdd(false)}>
              Cancel
            </button>
          </p>
        ) : (
          <button>Add</button>
        )}
      </form>
    </>
  );
}

function SupporterTable({
  rows,
  action,
  confirm,
  onAction,
}: {
  rows: Supporter[];
  action: string;
  // Asks inline rather than with confirm(), which some in-app email browsers suppress.
  confirm?: (s: Supporter) => string;
  onAction: (s: Supporter) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const showRemoved = rows.some((r) => r.removedAt);
  // Scrolls sideways on its own on narrow phones, so the page itself never does.
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Verified</th>
            <th>Notifications</th>
            <th>Joined</th>
            {showRemoved && <th>Removed</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <Fragment key={s.id}>
              <tr>
                <td>{s.name}</td>
                <td>{s.email}</td>
                <td>{s.emailVerified ? "Yes" : "Not yet"}</td>
                <td>{s.notificationsOn ? "On" : "Off"}</td>
                <td>{date(s.joinedAt)}</td>
                {s.removedAt && <td>{date(s.removedAt)}</td>}
                <td>
                  <button onClick={() => (confirm ? setConfirming(s.id) : onAction(s))}>{action}</button>
                </td>
              </tr>
              {confirm && confirming === s.id && (
                <tr>
                  <td colSpan={showRemoved ? 7 : 6}>
                    {confirm(s)}{" "}
                    <button
                      onClick={() => {
                        setConfirming(null);
                        onAction(s);
                      }}
                    >
                      Yes, {action.toLowerCase()}
                    </button>{" "}
                    <button onClick={() => setConfirming(null)}>Cancel</button>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
