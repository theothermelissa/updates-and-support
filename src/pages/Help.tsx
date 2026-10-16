import { CheckIcon, EllipsisVerticalIcon, XIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { FamilyShell, PageTitle } from "@/components/familyShell";
import { Confirm, ErrorMessage, Field, LinkedText, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type Me } from "../api.js";
import { capacityLabel, isPast, sortRequests, whenLabel } from "../help.js";

// A null name is an offer made without one.
type Offer = { id: string | null; name: string | null; mine: boolean; email: string | null };
// What the family sets on a request. date is "YYYY-MM-DD" and time "HH:MM", or null.
type RequestFields = {
  body: string;
  slots: number | null;
  requireName: boolean;
  requireEmail: boolean;
  date: string | null;
  time: string | null;
};
// A supporter's offers hold only their own; offered counts everyone's.
type HelpRequest = RequestFields & { id: string; full: boolean; offered: number; offers: Offer[] };

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
    <FamilyShell slug={slug} me={me} page="help" column onNameChanged={load}>
      <PageTitle>How to Help</PageTitle>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {family && <h3 className="text-lg font-semibold tracking-tight">Add a Request</h3>}
      {family && (
        <RequestForm
          submitLabel="Add request"
          onSubmit={(fields) => change("help", "POST", fields).then((r) => r.ok)}
        />
      )}
      {family && <h3 className="pt-4 text-lg font-semibold tracking-tight">All Requests</h3>}
      {requests.length === 0 && !family && <p>There aren't any requests right now.</p>}
      <div className="space-y-4">
        {sortRequests(requests, new Date()).map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            family={family}
            needsName={request.requireName && me.person.name === null}
            needsEmail={request.requireEmail && me.person.email === null}
            onSave={(fields) => change(`help/${request.id}`, "PATCH", fields).then((r) => r.ok)}
            onDelete={() => change(`help/${request.id}`, "DELETE").then((r) => r.ok)}
            onOffer={(helping, details) => change(`help/${request.id}/offer`, "POST", { helping, ...details }).then((r) => r.ok)}
            onRemove={(offerId) => change(`help/${request.id}/offers/${offerId}`, "DELETE").then((r) => r.ok)}
          />
        ))}
      </div>
    </FamilyShell>
  );
}

function RequestCard(props: {
  request: HelpRequest;
  family: boolean;
  needsName: boolean;
  needsEmail: boolean;
  onSave: (fields: RequestFields) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onOffer: (helping: boolean, details?: { name?: string; email?: string }) => Promise<boolean>;
  onRemove: (offerId: string) => Promise<boolean>;
}) {
  const { request } = props;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [bowingOut, setBowingOut] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const mine = request.offers.some((offer) => offer.mine);
  const past = isPast(request.date, request.time, new Date());
  const showButton = !request.full && !past && !mine;
  const needsDetails = props.needsName || props.needsEmail;

  async function offer(e: FormEvent) {
    e.preventDefault();
    // A name or email the request needs is asked for only once they press the button.
    if (needsDetails && !asking) return setAsking(true);
    setPending(true);
    const ok = await props.onOffer(true, {
      ...(props.needsName && { name }),
      ...(props.needsEmail && { email }),
    });
    setPending(false);
    if (ok) {
      setName("");
      setEmail("");
      setAsking(false);
    }
  }

  return (
    <article className="space-y-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      {editing ? (
        <RequestForm
          initial={request}
          submitLabel="Save"
          onSubmit={async (fields) => {
            const ok = await props.onSave(fields);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex items-start gap-2">
          {request.full && <CheckIcon className="mt-0.5 size-5 shrink-0 text-green-800" role="img" aria-label="Covered" />}
          {/* The count is inline-block, so the line through a covered or past request skips it. */}
          <div className="min-w-0 flex-1">
            {request.date && <p className="text-sm text-muted-foreground">{whenLabel(request.date, request.time)}</p>}
            <LinkedText text={request.body} className={request.full || past ? "line-through" : ""}>
              {/* inline-block, so the parentheses wrap with what's inside them. A margin rather
                  than a space, so a covered request's line through stops at its text. */}
              <span className="ml-1 inline-block text-sm text-muted-foreground">
                ({capacityLabel(request.slots, request.offered)})
              </span>
            </LinkedText>
          </div>
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
          {asking && props.needsName && (
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
            </Field>
          )}
          {asking && props.needsEmail && (
            <Field label={<span>Your email <span className="font-normal text-muted-foreground">(only the family will see this)</span></span>}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoFocus={!props.needsName}
              />
            </Field>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={pending}>
              <span aria-hidden="true">✋</span>I can help with this
            </Button>
            {asking && (
              <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
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
            {offer.mine ? "You" : (offer.name ?? "Someone")}
            {offer.email && <span className="text-muted-foreground"> · {offer.email}</span>}
            {offer.id && props.removing !== offer.id && (
              <button type="button" className="ml-3 underline underline-offset-2" onClick={() => props.setRemoving(offer.id)}>
                Remove
              </button>
            )}
          </p>
          {offer.id && props.removing === offer.id && (
            <Confirm yes="Yes, remove" onYes={() => props.onRemove(offer.id!)} onCancel={() => props.setRemoving(null)}>
              {offer.mine ? "Remove your offer?" : offer.name ? `Remove ${offer.name}'s offer?` : "Remove this offer?"}
            </Confirm>
          )}
        </li>
      ))}
    </ul>
  );
}

function RequestForm(props: {
  initial?: RequestFields;
  submitLabel: string;
  onSubmit: (fields: RequestFields) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(props.initial?.body ?? "");
  const [many, setMany] = useState(props.initial ? props.initial.slots === null : false);
  const [count, setCount] = useState(String(props.initial?.slots ?? 1));
  const [requireName, setRequireName] = useState(props.initial?.requireName ?? true);
  const [requireEmail, setRequireEmail] = useState(props.initial?.requireEmail ?? false);
  const [date, setDate] = useState(props.initial?.date ?? "");
  const [time, setTime] = useState(props.initial?.time ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await props.onSubmit({
      body,
      slots: many ? null : Number(count),
      requireName,
      requireEmail,
      date: date || null,
      time: date && time ? time : null,
    });
    setBusy(false);
    if (ok && !props.initial) {
      setBody("");
      setMany(false);
      setCount("1");
      setRequireName(true);
      setRequireEmail(false);
      setDate("");
      setTime("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h4 className="font-semibold">What Would Help</h4>
      <Field label="Description">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={2000} rows={4} />
      </Field>
      <div className="flex flex-wrap gap-4">
        <Field label="Date (optional)">
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (!e.target.value) setTime("");
            }}
            className="w-44"
          />
        </Field>
        <Field label="Time (optional)">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} className="w-36" />
        </Field>
      </div>
      <h4 className="pt-2 font-semibold">Who Can Help</h4>
      <Label>
        <Checkbox checked={many} onCheckedChange={(checked) => setMany(checked === true)} />
        Everyone can help with this
      </Label>
      {!many && (
        <Field label="How many people are needed?">
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
      <Label>
        <Checkbox checked={requireName} onCheckedChange={(checked) => setRequireName(checked === true)} />
        Require name
      </Label>
      <Label>
        <Checkbox checked={requireEmail} onCheckedChange={(checked) => setRequireEmail(checked === true)} />
        Require email
      </Label>
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
