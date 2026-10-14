import { useState, type FormEvent } from "react";
import { api } from "../api.js";

type Answered = { result?: "signed-in" | "wrong" | "limited"; error?: string };

const MESSAGES = {
  wrong: "That's not the answer we have. Please try again.",
  limited: "Too many attempts. Please try again later.",
};

// Verification and welcome emails link here. Only pressing the button confirms, because
// email security scanners open links before the recipient does. Someone not signed in
// here can then answer the community question to sign in; the link alone never does.
export function Verify({ slug }: { slug: string }) {
  // The token is after "#" in the link, so it never reaches a server's logs.
  const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
  const [state, setState] = useState<"ready" | "confirming" | "signed-in" | "question" | "confirmed" | "failed">("ready");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setState("confirming");
    const { status, data } = await api<{ canSignIn?: boolean }>(slug, "auth/verify", { method: "POST", body: { token } });
    if (status !== 200) return setState("failed");
    if ((await api(slug, "me")).status === 200) return setState("signed-in");
    if (!data.canSignIn) return setState("confirmed");
    const gate = await api<{ question: string }>(slug, "gate");
    setQuestion(gate.data.question);
    setState("question");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const { status, data } = await api<Answered>(slug, "auth/verify", { method: "POST", body: { token, answer } });
    setBusy(false);
    if (data?.result === "signed-in") return location.assign(`/f/${slug}`);
    if (data?.result === "wrong" || data?.result === "limited") return setMessage(MESSAGES[data.result]);
    if (status === 400) return setState("failed");
    setMessage(data?.error ?? "Something went wrong. Please try again.");
  }

  const signInByEmail = <a href={`/f/${slug}/family`}>sign in by email</a>;

  return (
    <main>
      <h1>{["signed-in", "question", "confirmed"].includes(state) ? "Email confirmed" : "Confirm your email"}</h1>
      {!token ? (
        <p className="error">This link is incomplete. Please use the full link from your email.</p>
      ) : state === "signed-in" ? (
        <p>
          Thanks for confirming your email.{" "}
          <button onClick={() => location.assign(`/f/${slug}`)}>Go to the updates</button>
        </p>
      ) : state === "question" ? (
        <>
          <p>Thanks for confirming your email. To see the updates on this device, answer the family's question:</p>
          <form onSubmit={submit}>
            <p>
              <label>
                {question}
                <br />
                <input value={answer} onChange={(e) => setAnswer(e.target.value)} required />
              </label>
            </p>
            <button disabled={busy}>Continue</button>
          </form>
          {message && <p className="error">{message}</p>}
        </>
      ) : state === "confirmed" ? (
        <p>Thanks for confirming your email. To see the updates on this device, {signInByEmail}.</p>
      ) : state === "failed" ? (
        <p className="error">This link has expired. Signing in by email also confirms your email: {signInByEmail}.</p>
      ) : (
        <button onClick={confirm} disabled={state === "confirming"}>
          Confirm my email
        </button>
      )}
    </main>
  );
}
