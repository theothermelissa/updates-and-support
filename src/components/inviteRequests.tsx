import { useState } from "react";
import { Confirm } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "../api.js";

// What GET people sends for an invite-only family; dates arrive as ISO strings.
export type InviteRequest = {
  id: string;
  name: string;
  email: string;
  message: string | null;
  createdAt: string;
};

type Reason = "supporter" | "family" | "removed";
type Reply = { added?: boolean; reason?: Reason; error?: string };

const ALREADY: Record<Reason, string> = {
  supporter: "That person is already a supporter.",
  family: "That person is already a family member.",
  removed: "That person was removed earlier, so they weren't added. Restore them from Removed if you want them back.",
};
const ERROR = "Something went wrong. Please try again.";

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// People who asked to join an invite-only family, waiting for a family member. Approving adds
// them as a supporter; declining deletes the request and tells them nothing. The caller shows
// the message and reloads its data after either.
export function InviteRequests({
  slug,
  requests,
  onDone,
}: {
  slug: string;
  requests: InviteRequest[];
  onDone: (message: { text: string; error: boolean }) => void;
}) {
  const [declining, setDeclining] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(r: InviteRequest, approve: boolean) {
    setBusy(true);
    setDeclining(null);
    const { status, data } = await api<Reply | null>(slug, `invite-requests/${r.id}`, {
      method: approve ? "POST" : "DELETE",
      // The server only reads JSON bodies on POST.
      body: approve ? {} : undefined,
    });
    setBusy(false);
    if (status !== 200) {
      // A 404 means it's already gone; the reload drops it from the list.
      return onDone({ text: data?.error ?? ERROR, error: true });
    }
    if (!approve) return onDone({ text: `Declined ${r.name}'s request.`, error: false });
    if (data?.added) {
      return onDone({ text: `Added ${r.name}. They'll get an email with a link to sign in.`, error: false });
    }
    onDone({ text: data?.reason ? ALREADY[data.reason] : ERROR, error: !data?.reason });
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-3">
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="break-all text-sm text-muted-foreground">
                {r.email} · asked {when(r.createdAt)}
              </p>
            </div>
            {r.message && <p className="whitespace-pre-wrap break-words">{r.message}</p>}
            {declining === r.id ? (
              <Confirm yes="Yes, decline" onYes={() => act(r, false)} onCancel={() => setDeclining(null)} disabled={busy}>
                Decline {r.name}? Nothing is sent to them.
              </Confirm>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => act(r, true)}>
                  Approve
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setDeclining(r.id)}>
                  Decline
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
