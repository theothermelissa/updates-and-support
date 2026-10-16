import { CheckIcon, EllipsisVerticalIcon, XIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Confirm, ErrorMessage, Field, LinkedText, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type Me } from "../api.js";
import { capacityLabel } from "../help.js";

type Offer = { id: string | null; name: string; mine: boolean; email: string | null };
// A supporter's offers hold only their own; offered counts everyone's.
type HelpRequest = { id: string; body: string; slots: number | null; full: boolean; offered: number; offers: Offer[] };

export function Help({ slug }: { slug: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [requests, setRequests] = useState<HelpRequest[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const [who, list] = await Promise.all([
      api<Me>(slug, "me"),
      api<{ requests: HelpRequest[] }>(slug, "help"),
    ]);
    if (who.status === 401 || list.status === 401) return location.replace(`/f/${slug}`);
    if (who.status !== 200 || list.status !== 200) return setError("Couldn't load ways to help. Please refresh the page.");
    setMe(who.data);
    setRequests(list.data.requests);
  }

  useEffect(() => {
    load();
  }, [slug]);

  async function change(path: string, method: string, body?: unknown): Promise<{ ok: boolean; name?: string; error?: string }> {
    setError("");
    const { status, data } = await api<{ name?: string; error?: string }>(slug, path, { method, body });
    if (status >= 300) {
      const message = data?.error ?? "Something went wrong. Please try again.";
      setError(message);
      if (status === 409) await load();
      return { ok: false, error: message };
    }
    if (data?.name && me && !me.person.name) setMe({ ...me, person: { ...me.person, name: data.name } });
    await load();
    return { ok: true, name: data?.name };
  }

  if (error && !me) return <PageShell title="How to help">{<ErrorMessage>{error}</ErrorMessage>}</PageShell>;
  if (!me || !requests) return null;
  const family = me.person.role === "family";

  return (
    <PageShell
      title="How to help"
      actions={
        <Button variant="outline" size="sm" asChild>
          <a href={`/f/${slug}`}>Back to updates</a>
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">{me.family.displayName}</p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {family && (
        <RequestForm
          submitLabel="Add request"
          onSubmit={(body, slots) => change("help", "POST", { body, slots }).then((r) => r.ok)}
        />
      )}
      {requests.length === 0 && !family && <p>There aren't any requests right now.</p>}
      <div className="space-y-4">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            family={family}
            needsName={me.person.name === null}
            onSave={(body, slots) => change(`help/${request.id}`, "PATCH", { body, slots }).then((r) => r.ok)}
            onDelete={() => change(`help/${request.id}`, "DELETE").then((r) => r.ok)}
            onOffer={(helping, name) =>
              change(`help/${request.id}/offer`, "POST", name === undefined ? { helping } : { helping, name }).then((r) => r.ok)
            }
            onRemove={(offerId) => change(`help/${request.id}/offers/${offerId}`, "DELETE").then((r) => r.ok)}
          />
        ))}
      </div>
    </PageShell>
  );
}

function RequestCard(props: {
  request: HelpRequest;
  family: boolean;
  needsName: boolean;
  onSave: (body: string, slots: number | null) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onOffer: (helping: boolean, name?: string) => Promise<boolean>;
  onRemove: (offerId: string) => Promise<boolean>;
}) {
  const { request } = props;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [askingName, setAskingName] = useState(false);
  const [bowingOut, setBowingOut] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const mine = request.offers.some((offer) => offer.mine);
  const showButton = !request.full && !mine;

  async function offer(e: FormEvent) {
    e.preventDefault();
    // Someone without a name is asked for one only once they press the button.
    if (props.needsName && !askingName) return setAskingName(true);
    if (props.needsName && name.trim() === "") return;
    setPending(true);
    const ok = await props.onOffer(true, props.needsName ? name : undefined);
    setPending(false);
    if (ok) {
      setName("");
      setAskingName(false);
    }
  }

  return (
    <article className="space-y-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      {editing ? (
        <RequestForm
          initial={{ body: request.body, slots: request.slots }}
          submitLabel="Save"
          onSubmit={async (body, slots) => {
            const ok = await props.onSave(body, slots);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex items-start gap-2">
          {request.full && <CheckIcon className="mt-0.5 size-5 shrink-0 text-green-800" role="img" aria-label="Covered" />}
          {/* The count is inline-block, so the line through a covered request skips it. */}
          <LinkedText text={request.body} className={`min-w-0 flex-1 ${request.full ? "line-through" : ""}`}>
            {/* inline-block, so the parentheses wrap with what's inside them. A margin rather
                than a space, so a covered request's line through stops at its text. */}
            <span className="ml-1 inline-block text-sm text-muted-foreground">
              ({capacityLabel(request.slots, request.offered)})
            </span>
          </LinkedText>
          {props.family && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Request options" className="-mt-1 -mr-2 text-muted-foreground">
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setConfirming(true)}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      {mine && (
        <p className="group flex w-fit items-center gap-2">
          <span aria-hidden="true">👍</span> You are helping
          {/* Always shown on touch screens, which can't hover. */}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Stop helping with this"
            className="text-muted-foreground group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
            onClick={() => setBowingOut(true)}
          >
            <XIcon />
          </Button>
        </p>
      )}
      {props.family && request.offers.length > 0 && (
        <OfferList offers={request.offers} removing={removing} setRemoving={setRemoving} onRemove={props.onRemove} />
      )}
      {showButton && !editing && (
        <form onSubmit={offer} className="space-y-3">
          {props.needsName && askingName && (
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
            </Field>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={pending}>
              <span aria-hidden="true">✋</span>I can help with this
            </Button>
            {props.needsName && askingName && (
              <Button type="button" variant="ghost" onClick={() => setAskingName(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
      <Dialog open={bowingOut} onOpenChange={setBowingOut}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Need to bow out?</DialogTitle>
            <DialogDescription>No problem — thanks for letting us know.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBowingOut(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const ok = await props.onOffer(false);
                setPending(false);
                if (ok) setBowingOut(false);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirming && !editing && (
        <Confirm yes="Yes, delete" onYes={props.onDelete} onCancel={() => setConfirming(false)}>
          Delete this request? People who offered to help will no longer be listed.
        </Confirm>
      )}
    </article>
  );
}

// The family's list of who offered, with emails and Remove.
function OfferList(props: {
  offers: Offer[];
  removing: string | null;
  setRemoving: (id: string | null) => void;
  onRemove: (offerId: string) => Promise<boolean>;
}) {
  return (
    <ul className="space-y-2 text-sm">
      {props.offers.map((offer, i) => (
        <li key={offer.id ?? i} className="space-y-2">
          <p>
            {offer.mine ? "You" : offer.name}
            {offer.email && <span className="text-muted-foreground"> · {offer.email}</span>}
            {offer.id && props.removing !== offer.id && (
              <button type="button" className="ml-3 underline underline-offset-2" onClick={() => props.setRemoving(offer.id)}>
                Remove
              </button>
            )}
          </p>
          {offer.id && props.removing === offer.id && (
            <Confirm yes="Yes, remove" onYes={() => props.onRemove(offer.id!)} onCancel={() => props.setRemoving(null)}>
              Remove {offer.mine ? "your" : `${offer.name}'s`} offer?
            </Confirm>
          )}
        </li>
      ))}
    </ul>
  );
}

function RequestForm(props: {
  initial?: { body: string; slots: number | null };
  submitLabel: string;
  onSubmit: (body: string, slots: number | null) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(props.initial?.body ?? "");
  const [many, setMany] = useState(props.initial ? props.initial.slots === null : false);
  const [count, setCount] = useState(String(props.initial?.slots ?? 1));
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const slots = many ? null : Number(count);
    setBusy(true);
    const ok = await props.onSubmit(body, slots);
    setBusy(false);
    if (ok && !props.initial) {
      setBody("");
      setMany(false);
      setCount("1");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="What would help">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={2000} rows={4} />
      </Field>
      <Label>
        <Checkbox checked={many} onCheckedChange={(checked) => setMany(checked === true)} />
        Everyone can help with this
      </Label>
      {!many && (
        <Field label="How many people can help">
          <Input
            type="number"
            min={1}
            max={99}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            required
            className="w-24"
          />
        </Field>
      )}
      <div className="flex gap-2">
        <Button disabled={busy}>{props.submitLabel}</Button>
        {props.onCancel && (
          <Button type="button" variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
