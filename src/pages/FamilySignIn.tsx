import { useState, type FormEvent } from "react";
import { api } from "../api.js";

// Family members and returning supporters both sign in here; the server sends the
// same kind of link either way.
export function FamilySignIn({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"form" | "sending" | "sent" | "error">("form");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const { status } = await api(slug, "auth/request-link", { method: "POST", body: { email } });
    setState(status === 200 ? "sent" : "error");
  }

  if (state === "sent") {
    return (
      <main>
        <h1>Check your email</h1>
        <p>If that email belongs to someone in this family, we've sent it a sign-in link. It expires in 15 minutes.</p>
      </main>
    );
  }
  return (
    <main>
      <h1>Sign in by email</h1>
      <form onSubmit={submit}>
        <label>
          Email <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>{" "}
        <button disabled={state === "sending"}>Send sign-in link</button>
      </form>
      {state === "error" && <p className="error">Something went wrong. Please try again.</p>}
    </main>
  );
}
