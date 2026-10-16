import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { linkify } from "../linkify.js";

// The frame every page shares: a centered column with the page's title and, optionally,
// links or buttons beside it.
export function PageShell(props: { title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
        {props.actions && <div className="flex items-center gap-2 text-sm">{props.actions}</div>}
      </header>
      {props.children}
    </main>
  );
}

// A form control with its label stacked above it.
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Label className="flex-col items-start gap-2 leading-normal">
      {label}
      {children}
    </Label>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

// Asks on the page rather than with confirm(), which some in-app email browsers suppress.
export function Confirm(props: { children: ReactNode; yes: string; onYes: () => void; onCancel: () => void }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
      <p className="basis-full">{props.children}</p>
      <Button type="button" variant="destructive" onClick={props.onYes}>
        {props.yes}
      </Button>
      <Button type="button" variant="outline" onClick={props.onCancel}>
        Cancel
      </Button>
    </div>
  );
}

// Plain text with its line breaks kept and its web addresses as links.
export function LinkedText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`break-words whitespace-pre-wrap ${className ?? ""}`}>
      {linkify(text).map((segment, i) =>
        "href" in segment ? (
          <a key={i} href={segment.href} target="_blank" rel="noopener noreferrer">
            {segment.href}
          </a>
        ) : (
          segment.text
        ),
      )}
    </p>
  );
}
