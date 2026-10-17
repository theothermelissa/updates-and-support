import { MenuIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
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
// screen, for pages that read top to bottom. onPersonChanged runs after the menu saves a name or phone number.
// home is the address of Updates. Its links move between pages without a page load. noCopy
// discourages copying the page's content, leaving text boxes and the editor alone.
export function FamilyShell(props: {
  slug: string;
  home: string;
  me: Me;
  page: FamilyPage;
  onPersonChanged: () => void;
  column?: boolean;
  noCopy?: boolean;
  children?: ReactNode;
}) {
  const { slug, me, page } = props;
  const [editing, setEditing] = useState<"name" | "phone" | null>(null);
  const supporter = me.person.role === "supporter";
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

  async function save(path: "name" | "phone", body: object): Promise<string | null> {
    const { status, data } = await api<{ person?: Me["person"]; error?: string }>(slug, path, {
      method: "POST",
      body,
    });
    if (status !== 200 || !data?.person) return data?.error ?? "Something went wrong. Please try again.";
    props.onPersonChanged();
    return null;
  }

  return (
    <main
      className={`mx-auto max-w-2xl space-y-6 px-4 py-8 lg:max-w-6xl ${props.noCopy ? "no-copy" : ""}`}
      onCopy={props.noCopy ? blockOutsideEditable : undefined}
      onCut={props.noCopy ? blockOutsideEditable : undefined}
      onContextMenu={props.noCopy ? blockOutsideEditable : undefined}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
          <a href={props.home} data-slot="family-name" onClick={followLink}>
            {me.family.displayName}
          </a>
        </h1>
        <nav className="-mr-2 flex items-center gap-1 text-sm">
          {link("updates", props.home, "Updates")}
          {(me.person.role === "family" || me.family.hasHelpRequests || me.family.hasHelpMessage) &&
            link("help", `/f/${slug}/help`, "How to help")}
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
                  <DropdownMenuItem onSelect={() => setEditing("name")}>Edit name</DropdownMenuItem>
                </>
              )}
              {supporter && (
                <DropdownMenuItem onSelect={() => setEditing("phone")}>
                  {me.person.phone ? "Edit phone number" : "Add phone number"}
                </DropdownMenuItem>
              )}
              {(me.person.name || supporter) && <DropdownMenuSeparator />}
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
        <FieldDialog
          open={editing === "name"}
          title="Edit name"
          description="This is the name people see for you."
          label="Your name"
          value={me.person.name}
          maxLength={100}
          onOpenChange={(open) => setEditing(open ? "name" : null)}
          onSave={(name) => save("name", { name })}
        />
      )}
      {supporter && (
        <FieldDialog
          open={editing === "phone"}
          title={me.person.phone ? "Edit phone number" : "Add phone number"}
          description="Only the family will see this, so they can call or text you. Leave it empty to remove it."
          label="Your phone number"
          value={me.person.phone ?? ""}
          type="tel"
          maxLength={30}
          optional
          onOpenChange={(open) => setEditing(open ? "phone" : null)}
          onSave={(phone) => save("phone", { phone })}
        />
      )}
    </main>
  );
}

// Cancels a copy, cut, or right-click unless it happens in a text box or the editor. React
// events bubble through portals, so the dialogs' text boxes are covered too.
function blockOutsideEditable(e: SyntheticEvent) {
  const target = e.target instanceof Element ? e.target : null;
  if (!target?.closest("input, textarea, [contenteditable]")) e.preventDefault();
}

// A one-field dialog from the menu, for "Edit name" and the phone number. Saving stores the
// value; cancelling leaves it as it was. optional lets an empty box be saved, to clear it.
type FieldDialogProps = {
  title: string;
  description: string;
  label: string;
  value: string;
  type?: "text" | "tel";
  maxLength: number;
  optional?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: string) => Promise<string | null>;
};

function FieldDialog(props: FieldDialogProps & { open: boolean }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open && <FieldForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function FieldForm(props: FieldDialogProps) {
  const [value, setValue] = useState(props.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const failed = await props.onSave(value);
    setBusy(false);
    if (failed) setError(failed);
    else props.onOpenChange(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
      </DialogHeader>
      <Field label={props.label}>
        <Input
          type={props.type ?? "text"}
          autoComplete={props.type === "tel" ? "tel" : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required={!props.optional}
          maxLength={props.maxLength}
          autoFocus
        />
      </Field>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={busy || (!props.optional && !value.trim())}>Save</Button>
      </DialogFooter>
    </form>
  );
}

// A page's own heading, under the navigation bar.
export function PageTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>;
}
