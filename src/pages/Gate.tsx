import { useEffect, useState, type FormEvent } from "react";
import { EmailInput, ErrorMessage, Field, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

// An invite-only family's signed-out page: "sign in with your email," or ask the family for an
// invite. Each says the same thing whether or not the email belongs to someone in the family.
function InviteOnlyGate({ slug, displayName }: { slug: string; displayName: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"form" | "sending" | "sent" | "error">("form");
  const [requesting, setRequesting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const { status } = await api(slug, "auth/request-link", { method: "POST", body: { email } });
    setState(status === 200 ? "sent" : "error");
  }

  if (requesting) return <RequestInvite slug={slug} displayName={displayName} onBack={() => setRequesting(false)} />;
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
                <Button variant="outline" disabled={state === "sending"}>
                  Send me a sign-in link
                </Button>
              </form>
            </CardContent>
          </Card>
          {state === "error" && <ErrorMessage>Something went wrong. Please try again.</ErrorMessage>}
          <Button type="button" onClick={() => setRequesting(true)}>
            Request an invite
          </Button>
        </>
      )}
    </PageShell>
  );
}

const MESSAGE_MAX = 500;

// Asks the family for an invite. The reply is the same whoever the email belongs to.
function RequestInvite({ slug, displayName, onBack }: { slug: string; displayName: string; onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"thanks" | "closed" | null>(null);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data } = await api<{ result?: "thanks" | "closed"; error?: string }>(slug, "invite-requests", {
      method: "POST",
      body: { name, email, message: note },
    });
    setBusy(false);
    if (data?.result === "thanks" || data?.result === "closed") return setResult(data.result);
    setError(data?.error ?? "Something went wrong. Please try again.");
  }

  return (
    <PageShell title={displayName}>
      {result ? (
        <>
          <p>
            {result === "thanks"
              ? "Thanks. If the family approves, you'll get an email at that address."
              : "Requests are closed right now. Please contact the family."}
          </p>
          <p className="text-sm">
            <Button type="button" variant="link" className="h-auto p-0" onClick={onBack}>
              Back
            </Button>
          </p>
        </>
      ) : (
        <>
          <p>Ask the family for an invite. If they approve, we'll email you a link to sign in.</p>
          <Card>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <Field label="Name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
                </Field>
                <Field label="Email">
                  <EmailInput required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Message (optional)">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MESSAGE_MAX} rows={4} />
                </Field>
                <p className="text-sm text-muted-foreground">
                  {note.length} / {MESSAGE_MAX}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy}>Send request</Button>
                  <Button type="button" variant="outline" onClick={onBack}>
                    Back
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </>
      )}
    </PageShell>
  );
}
