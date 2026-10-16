import { MenuIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorMessage, Field, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Me } from "../api.js";
import { Feed } from "./Feed.js";
import { Gate } from "./Gate.js";
import { NotFound } from "./NotFound.js";

export function FamilyHome({ slug }: { slug: string }) {
  const [me, setMe] = useState<Me | "loading" | "signed-out" | "not-found">("loading");
  const [editingName, setEditingName] = useState(false);

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
  const signedIn = me;

  async function saveName(name: string): Promise<string | null> {
    const { status, data } = await api<{ person?: Me["person"]; error?: string }>(slug, "name", {
      method: "POST",
      body: { name },
    });
    if (status !== 200 || !data?.person) return data?.error ?? "Something went wrong. Please try again.";
    setMe({ ...signedIn, person: data.person });
    return null;
  }

  return (
    <PageShell
      wide
      title={me.family.displayName}
      actions={
        <>
          {(me.person.role === "family" || me.family.hasHelpRequests) && (
            <Button variant="ghost" size="sm" asChild>
              <a href={`/f/${slug}/help`}>How to help</a>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <a href={`/f/${slug}/wall`}>Notes</a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menu" className="text-muted-foreground">
                <MenuIcon className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {me.person.name && (
                <>
                  <DropdownMenuLabel className="font-normal text-muted-foreground">
                    Signed in as <span className="font-medium text-foreground">{me.person.name}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setEditingName(true)}>Edit name</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {me.person.role === "family" && (
                <DropdownMenuItem asChild>
                  <a href={`/f/${slug}/people`}>People</a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
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
      {me.person.name && (
        <NameDialog open={editingName} name={me.person.name} onOpenChange={setEditingName} onSave={saveName} />
      )}
    </PageShell>
  );
}

// The menu's "Edit name". Saving stores the name; cancelling leaves it as it was.
function NameDialog(props: {
  open: boolean;
  name: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<string | null>;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open && <NameForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function NameForm(props: {
  name: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(props.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const failed = await props.onSave(name);
    setBusy(false);
    if (failed) setError(failed);
    else props.onOpenChange(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Edit name</DialogTitle>
        <DialogDescription>This is the name people see for you.</DialogDescription>
      </DialogHeader>
      <Field label="Your name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
      </Field>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={busy || !name.trim()}>Save</Button>
      </DialogFooter>
    </form>
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
