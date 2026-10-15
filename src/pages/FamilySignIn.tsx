import { useState, type FormEvent } from "react";
import { ErrorMessage, Field, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
      <PageShell title="Check your email">
        <p>If that email belongs to someone in this family, we've sent it a sign-in link. It expires in 15 minutes.</p>
      </PageShell>
    );
  }
  return (
    <PageShell title="Sign in by email">
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button disabled={state === "sending"}>Send sign-in link</Button>
          </form>
        </CardContent>
      </Card>
      {state === "error" && <ErrorMessage>Something went wrong. Please try again.</ErrorMessage>}
    </PageShell>
  );
}
