import { useEffect, useState, type FormEvent } from "react";
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
type People = { supporters: Supporter[]; removed: Supporter[]; question: string; acceptedAnswers: string[] };

function date(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Family members' page for the supporter list and the community question. The server
// refuses the data to anyone else; this page only shows what it's given.
export function People({ slug }: { slug: string }) {
  const [people, setPeople] = useState<People | "loading" | "forbidden" | "signed-out" | "not-found">("loading");
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState("");
  const [message, setMessage] = useState("");

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

  async function setRemoved(supporter: Supporter, removed: boolean) {
    if (removed && !confirm(`Remove ${supporter.name}? They'll be signed out and can't rejoin with this email.`)) return;
    const { status, data } = await api<{ error?: string }>(slug, `people/${supporter.id}`, {
      method: "PATCH",
      body: { removed },
    });
    if (status !== 200) return setMessage(data?.error ?? "Something went wrong. Please try again.");
    setMessage("");
    load();
  }

  async function saveQuestion(e: FormEvent) {
    e.preventDefault();
    const { status, data } = await api<{ error?: string }>(slug, "question", {
      method: "PUT",
      body: { question, answers: answers.split("\n") },
    });
    setMessage(status === 200 ? "Question saved." : (data?.error ?? "Something went wrong. Please try again."));
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
      {message && <p className="error">{message}</p>}

      <h2>Supporters ({people.supporters.length})</h2>
      {people.supporters.length === 0 ? (
        <p>No supporters have joined yet.</p>
      ) : (
        <SupporterTable rows={people.supporters} action="Remove" onAction={(s) => setRemoved(s, true)} />
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

function SupporterTable({
  rows,
  action,
  onAction,
}: {
  rows: Supporter[];
  action: string;
  onAction: (s: Supporter) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Verified</th>
          <th>Notifications</th>
          <th>Joined</th>
          {rows.some((r) => r.removedAt) && <th>Removed</th>}
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id}>
            <td>{s.name}</td>
            <td>{s.email}</td>
            <td>{s.emailVerified ? "Yes" : "Not yet"}</td>
            <td>{s.notificationsOn ? "On" : "Off"}</td>
            <td>{date(s.joinedAt)}</td>
            {s.removedAt && <td>{date(s.removedAt)}</td>}
            <td>
              <button onClick={() => onAction(s)}>{action}</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
