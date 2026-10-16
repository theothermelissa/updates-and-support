import { MenuIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type Me } from "../api.js";

export type FamilyPage = "updates" | "help" | "notes" | "people";

// The frame of every page signed in to a family: the family's name and the navigation bar,
// above one centered container. column keeps the content to the feed's width on a wide
// screen, for pages that read top to bottom.
export function FamilyShell(props: { slug: string; me: Me; page: FamilyPage; column?: boolean; children?: ReactNode }) {
  const { slug, me, page } = props;
  const link = (target: FamilyPage, href: string, label: string) => (
    <Button variant={page === target ? "secondary" : "ghost"} size="sm" asChild>
      <a href={href} aria-current={page === target ? "page" : undefined}>
        {label}
      </a>
    </Button>
  );

  async function signOut() {
    await api(slug, "auth/sign-out", { method: "POST" });
    location.assign(`/f/${slug}`);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 lg:max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{me.family.displayName}</h1>
        <nav className="-mr-2 flex items-center gap-1 text-sm">
          {link("updates", `/f/${slug}`, "Updates")}
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
                  <DropdownMenuSeparator />
                </>
              )}
              {me.person.role === "family" && (
                <DropdownMenuItem asChild>
                  <a href={`/f/${slug}/people`} aria-current={page === "people" ? "page" : undefined}>
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
    </main>
  );
}

// A page's own heading, under the navigation bar.
export function PageTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>;
}
