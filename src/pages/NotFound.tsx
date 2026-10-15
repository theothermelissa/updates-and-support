import { PageShell } from "@/components/page";

export function NotFound() {
  return (
    <PageShell title="Not found">
      <p className="text-muted-foreground">There's nothing at this address.</p>
    </PageShell>
  );
}
