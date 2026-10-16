import { useEffect, useState, type FormEvent } from "react";
import { ErrorMessage, Field, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Me } from "../api.js";
import { Feed } from "./Feed.js";
import { Gate } from "./Gate.js";
import { NotFound } from "./NotFound.js";

export function FamilyHome({ slug }: { slug: string }) {
  const [me, setMe] = useState<Me | "loading" | "signed-out" | "not-found">("loading");

  function load() {
    api<Me>(slug, "me").then(({ status, data }) => {
      if (status === 200) setMe(data);
      else setMe(status === 404 ? "not-found" : "signed-out");
    });
  }

  useEffect(load, [slug]);

  async function setNotifications(on: boolean) {
    const { status, data } = await api<{ person: Me["person"] }>(slug, "notifications", {
      method: "POST",
      body: { on },
    });
    if (status === 200 && typeof me === "object") setMe({ ...me, person: data.person });
  }

  async function signOut() {
    await api(slug, "auth/sign-out", { method: "POST" });
    setMe("signed-out");
  }

  if (me === "loading") return null;
  if (me === "not-found") return <NotFound />;
  if (me === "signed-out") return <Gate slug={slug} onJoined={load} />;
  return (
    <PageShell
      title={me.family.displayName}
      actions={
        <>
          {me.person.role === "family" && (
            <Button variant="ghost" size="sm" asChild>
              <a href={`/f/${slug}/people`}>People</a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </>
      }
    >
      {me.person.name && <p className="text-sm text-muted-foreground">Signed in as {me.person.name}.</p>}
      {me.person.role === "supporter" && !me.person.email && (
        <EmailPrompt slug={slug} reload={load} hasName={me.person.name !== null} />
      )}
      {me.person.role === "supporter" && me.person.email && (
        <div className="space-y-2">
          <Label>
            <Checkbox
              checked={me.person.notificationsOn}
              onCheckedChange={(checked) => setNotifications(checked === true)}
            />
            Email me when there's a new update
          </Label>
          {me.person.notificationsOn && !me.person.emailVerified && (
            <p className="text-sm text-muted-foreground">
              Emails start once you confirm {me.person.email}: look for a "Confirm your email" message, or sign in
              by email once.
            </p>
          )}
        </div>
      )}
      <Feed
        slug={slug}
        canEdit={me.person.role === "family"}
        needsName={me.person.name === null}
        onNamed={(name) => setMe({ ...me, person: { ...me.person, name } })}
      />
    </PageShell>
  );
}

// For a supporter who hasn't given an email. Optional, and never in the way of reading. Someone
// who already gave a name with a note keeps it, so they're asked only for an email.
function EmailPrompt({ slug, reload, hasName }: { slug: string; reload: () => void; hasName: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [sentLink, setSentLink] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { status, data } = await api<{ result?: "verify" | "sign-in-link"; error?: string }>(slug, "email", {
      method: "POST",
      body: hasName ? { email } : { name, email },
    });
    setBusy(false);
    // A new email, or signed out in the meantime: reloading shows what's next.
    if (data?.result === "verify" || status === 401) return reload();
    if (data?.result === "sign-in-link") return setSentLink(true);
    setError(data?.error ?? "Something went wrong. Please try again.");
  }

  if (sentLink) {
    return (
      <Card>
        <CardContent>
          That email is already on the family's list, so we've sent it a link to sign in on this device. You can keep
          reading here in the meantime.
        </CardContent>
      </Card>
    );
  }
  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-base font-medium">Get an email when there's a new update</p>
          <Button size="lg" onClick={() => setOpen(true)}>
            Add your email
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Get an email when there's a new update</CardTitle>
        <CardDescription>The family will see your name and email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {!hasName && (
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
            </Field>
          )}
          <Field label="Your email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={hasName} />
          </Field>
          <div className="flex gap-2">
            <Button disabled={busy}>Keep me updated</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </form>
      </CardContent>
    </Card>
  );
}
