import { useState } from "react";
import { api } from "../api.js";

// The verification email's link lands here. Only pressing the button confirms, because
// email security scanners open links before the recipient does. It never signs in.
export function Verify({ slug }: { slug: string }) {
  // The token is after "#" in the link, so it never reaches a server's logs.
  const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
  const [state, setState] = useState<"ready" | "confirming" | "confirmed" | "failed">("ready");

  async function confirm() {
    setState("confirming");
    const { status } = await api(slug, "auth/verify", { method: "POST", body: { token } });
    setState(status === 200 ? "confirmed" : "failed");
  }

  return (
    <main>
      <h1>Confirm your email</h1>
      {!token ? (
        <p className="error">This link is incomplete. Please use the full link from your email.</p>
      ) : state === "confirmed" ? (
        <p>
          Thanks, your email is confirmed. <a href={`/f/${slug}`}>Go to the updates</a>.
        </p>
      ) : state === "failed" ? (
        <p className="error">
          This link has expired or was already used. Signing in by email also confirms it:{" "}
          <a href={`/f/${slug}/family`}>sign in by email</a>.
        </p>
      ) : (
        <button onClick={confirm} disabled={state === "confirming"}>
          Confirm my email
        </button>
      )}
    </main>
  );
}
