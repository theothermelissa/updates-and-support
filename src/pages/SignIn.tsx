import { useState } from "react";
import { ErrorMessage, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { api } from "../api.js";

// The emailed link lands here. Only pressing the button spends it, because email
// security scanners open links before the recipient does.
export function SignIn({ slug }: { slug: string }) {
  // The token is after "#" in the link, so it never reaches a server's logs.
  const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
  const [state, setState] = useState<"ready" | "signing-in" | "failed">("ready");

  async function signIn() {
    setState("signing-in");
    const { status } = await api(slug, "auth/sign-in", { method: "POST", body: { token } });
    if (status === 200) location.replace(`/f/${slug}`); // replace keeps the token out of history
    else setState("failed");
  }

  return (
    <PageShell title="Sign in">
      {!token ? (
        <ErrorMessage>
          This link is incomplete. <a href={`/f/${slug}/family`}>Get a new one</a>.
        </ErrorMessage>
      ) : state === "failed" ? (
        <ErrorMessage>
          This link has expired or was already used. <a href={`/f/${slug}/family`}>Get a new one</a>.
        </ErrorMessage>
      ) : (
        <Button size="lg" onClick={signIn} disabled={state === "signing-in"}>
          Sign in
        </Button>
      )}
    </PageShell>
  );
}
