import { useEffect, useState, type FormEvent } from "react";
import { FamilyShell } from "@/components/familyShell";
import { ErrorMessage, Field } from "@/components/page";
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

  if (me === "loading") return null;
  if (me === "not-found") return <NotFound />;
  if (me === "signed-out") return <Gate slug={slug} onJoined={load} />;

  return (
    <FamilyShell slug={slug} me={me} page="updates" onPersonChanged={load}>
      {me.person.role === "supporter" && !me.person.email && (
        <EmailPrompt slug={slug} reload={load} storedName={me.person.name} />
      )}
      {me.person.role === "supporter" && me.person.email && (
        <div className="space-y-2 lg:w-[42rem]">
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
        photos={me.family.photos}
        name={me.person.name}
        onNamed={(name) => setMe({ ...me, person: { ...me.person, name } })}
        onSignedOut={() => setMe("signed-out")}
      />
    </FamilyShell>
  );
}

// For a supporter who hasn't given an email. Optional, and never in the way of reading.
// The name is filled in when they have one. It's sent only if they change it, so a name
// saved somewhere else isn't put back by a form that was already open.
function EmailPrompt(props: { slug: string; reload: () => void; storedName: string | null }) {
  const { slug, reload, storedName } = props;
  const [name, setName] = useState(storedName ?? "");
  const [nameEdited, setNameEdited] = useState(false);
  // The prompt is on the page before a note saves a name. Until they type in the field,
  // show the name on their record.
  useEffect(() => {
    if (!nameEdited) setName(storedName ?? "");
  }, [storedName, nameEdited]);
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
      body: storedName === null || nameEdited ? { name, email } : { email },
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
          <Field label="Your name">
            <Input
              value={name}
              onChange={(e) => {
                setNameEdited(true);
                setName(e.target.value);
              }}
              required
              maxLength={100}
              autoFocus={storedName === null}
            />
          </Field>
          <Field label="Your email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={storedName !== null} />
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
