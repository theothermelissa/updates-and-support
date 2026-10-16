import { MenuIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { ErrorMessage, Field } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api, type Me } from "../api.js";
import { followLink } from "../navigate.js";

export type FamilyPage = "updates" | "help" | "notes" | "people";

// The frame of every page signed in to a family: the family's name and the navigation bar,
// above one centered container. column keeps the content to the feed's width on a wide
// screen, for pages that read top to bottom. onNameChanged runs after "Edit name" saves.
// home is the address of Updates. Its links move between pages without a page load.
export function FamilyShell(props: {
  slug: string;
  home: string;
  me: Me;
  page: FamilyPage;
  onNameChanged: () => void;
  column?: boolean;
  children?: ReactNode;
}) {
  const { slug, me, page } = props;
  const [editingName, setEditingName] = useState(false);
  const link = (target: FamilyPage, href: string, label: string) => (
    <Button variant={page === target ? "secondary" : "ghost"} size="sm" asChild>
      <a href={href} aria-current={page === target ? "page" : undefined} onClick={followLink}>
        {label}
      </a>
    </Button>
  );

  async function signOut() {
    await api(slug, "auth/sign-out", { method: "POST" });
    location.assign(`/f/${slug}`);
  }

  async function saveName(name: string): Promise<string | null> {
    const { status, data } = await api<{ person?: Me["person"]; error?: string }>(slug, "name", {
      method: "POST",
      body: { name },
    });
    if (status !== 200 || !data?.person) return data?.error ?? "Something went wrong. Please try again.";
    props.onNameChanged();
    return null;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 lg:max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
          <a href={props.home} data-slot="family-name" onClick={followLink}>
            {me.family.displayName}
          </a>
        </h1>
        <nav className="-mr-2 flex items-center gap-1 text-sm">
          {link("updates", props.home, "Updates")}
          {(me.person.role === "family" || me.family.hasHelpRequests) && link("help", `/f/${slug}/help`, "How to help")}
          {link("notes", `/f/${slug}/wall`, "Notes")}
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
                  <a
                    href={`/f/${slug}/people`}
                    aria-current={page === "people" ? "page" : undefined}
                    onClick={followLink}
                  >
                    People
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </header>
      {props.column ? <div className="space-y-6 lg:w-[42rem]">{props.children}</div> : props.children}
      {me.person.name && (
        <NameDialog open={editingName} name={me.person.name} onOpenChange={setEditingName} onSave={saveName} />
      )}
    </main>
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

// A page's own heading, under the navigation bar.
export function PageTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>;
}
