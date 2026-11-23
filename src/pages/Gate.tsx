import { useEffect, useState, type FormEvent } from "react";
import { EmailInput, ErrorMessage, Field, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../api.js";

type GateResult = { result?: "wrong" | "limited" | "joined"; error?: string };

// What GET gate says. question is absent on an invite-only family, which has none.
export type GateInfo = { displayName: string; slug: string; home: string; inviteOnly: boolean; question?: string };

const MESSAGES = {
  wrong: "That's not the answer we have. Please try again.",
  limited: "Too many attempts. Please try again later.",
};

// What a visitor who isn't signed in sees: the community question. A correct answer
// goes straight to the updates. An invite-only family offers only a sign-in link instead.
export function Gate({ slug, onJoined }: { slug: string; onJoined: () => void }) {
  const [info, setInfo] = useState<GateInfo | null>(null);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<GateInfo>(slug, "gate").then(({ data }) => setInfo(data));
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
  if (info.inviteOnly) return <InviteOnlyGate slug={slug} displayName={info.displayName} />;
  return (
    <PageShell title={info.displayName}>
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label={info.question}>
              <Input value={answer} onChange={(e) => setAnswer(e.target.value)} required />
            </Field>
            <Button disabled={busy}>Continue</Button>
          </form>
        </CardContent>
      </Card>
      {message && <ErrorMessage>{message}</ErrorMessage>}
      <p className="flex flex-col gap-1 text-sm">
        <a href={`/f/${slug}/family`}>Already joined? Sign in by email</a>
        <a href={`/f/${slug}/family`}>Family sign-in</a>
      </p>
    </PageShell>
  );
}

// An invite-only family's signed-out page: only "sign in with your email." It says the same
// thing whether or not the email belongs to someone in the family.
function InviteOnlyGate({ slug, displayName }: { slug: string; displayName: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"form" | "sending" | "sent" | "error">("form");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const { status } = await api(slug, "auth/request-link", { method: "POST", body: { email } });
    setState(status === 200 ? "sent" : "error");
  }

  return (
    <PageShell title={displayName}>
      {state === "sent" ? (
        <div className="space-y-2">
          <p className="font-medium">Check your email.</p>
          <p>If you've been invited, we've sent you a sign-in link. It expires in 15 minutes.</p>
        </div>
      ) : (
        <>
          <p>This site is private. If you've been invited, sign in with your email.</p>
          <Card>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <Field label="Email">
                  <EmailInput required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Button disabled={state === "sending"}>Send me a sign-in link</Button>
              </form>
            </CardContent>
          </Card>
          {state === "error" && <ErrorMessage>Something went wrong. Please try again.</ErrorMessage>}
        </>
      )}
    </PageShell>
  );
}
