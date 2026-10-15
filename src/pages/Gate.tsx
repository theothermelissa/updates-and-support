import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api.js";

type GateResult = { result?: "wrong" | "limited" | "joined"; error?: string };

const MESSAGES = {
  wrong: "That's not the answer we have. Please try again.",
  limited: "Too many attempts. Please try again later.",
};

// What a visitor who isn't signed in sees: the community question. A correct answer
// goes straight to the updates.
export function Gate({ slug, onJoined }: { slug: string; onJoined: () => void }) {
  const [info, setInfo] = useState<{ displayName: string; question: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ displayName: string; question: string }>(slug, "gate").then(({ data }) => setInfo(data));
  }, [slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const { data } = await api<GateResult>(slug, "gate", { method: "POST", body: { answer } });
    setBusy(false);
    if (data?.result === "joined") return onJoined();
    if (data?.result === "wrong" || data?.result === "limited") return setMessage(MESSAGES[data.result]);
    setMessage(data?.error ?? "Something went wrong. Please try again.");
  }

  if (!info) return null;
  return (
    <main>
      <h1>{info.displayName}</h1>
      <form onSubmit={submit}>
        <p>
          <label>
            {info.question}
            <br />
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} required />
          </label>
        </p>
        <button disabled={busy}>Continue</button>
      </form>
      {message && <p className="error">{message}</p>}
      <p>
        <a href={`/f/${slug}/family`}>Already joined? Sign in by email</a>
        <br />
        <a href={`/f/${slug}/family`}>Family sign-in</a>
      </p>
    </main>
  );
}
