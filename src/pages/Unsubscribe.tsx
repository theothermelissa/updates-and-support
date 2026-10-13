import { useState } from "react";

// A notification email's unsubscribe link lands here. Only pressing the button turns
// notifications off, because email security scanners open links before people do.
export function Unsubscribe({ slug }: { slug: string }) {
  // The token is after "#" in the link, so opening the page doesn't send it anywhere.
  const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
  const [state, setState] = useState<"ready" | "working" | "done" | "error">("ready");

  async function turnOff() {
    setState("working");
    const res = await fetch(`/api/f/${slug}/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
    setState(res.ok ? "done" : "error");
  }

  return (
    <main>
      <h1>Notification emails</h1>
      {!token ? (
        <p className="error">This link is incomplete. Please use the full link from your email.</p>
      ) : state === "done" ? (
        <p>
          Notification emails are off. You can turn them back on any time after{" "}
          <a href={`/f/${slug}`}>signing in</a>.
        </p>
      ) : (
        <>
          <p>Stop getting an email when there's a new update?</p>
          <button onClick={turnOff} disabled={state === "working"}>
            Turn off notifications
          </button>
          {state === "error" && <p className="error">Something went wrong. Please try again.</p>}
        </>
      )}
    </main>
  );
}
