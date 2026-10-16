import { CheckIcon, EllipsisVerticalIcon, XIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { PageTitle } from "@/components/familyShell";
import { Confirm, EmailInput, ErrorMessage, Field, LinkedText, PhoneLink } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../api.js";
import { capacityLabel, isPast, sortRequests, whenLabel } from "../help.js";
import type { FamilyPageProps } from "./FamilyFrame.js";

// A null name is an offer made without one.
type Offer = { id: string | null; name: string | null; mine: boolean; email: string | null; phone: string | null };
// What the family sets on a request. date is "YYYY-MM-DD" and time "HH:MM", or null.
type RequestFields = {
  body: string;
  slots: number | null;
  requireName: boolean;
  requireEmail: boolean;
  requirePhone: boolean;
  date: string | null;
  time: string | null;
};
// A supporter's offers hold only their own; offered counts everyone's.
type HelpRequest = RequestFields & { id: string; full: boolean; offered: number; offers: Offer[] };

export function Help({ slug, me, reloadMe }: FamilyPageProps) {
  const [requests, setRequests] = useState<HelpRequest[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const list = await api<{ requests: HelpRequest[] }>(slug, "help");
    if (list.status === 401) return location.replace(`/f/${slug}`);
    if (list.status !== 200) return setError("Couldn't load ways to help. Please refresh the page.");
    setRequests(list.data.requests);
  }

  // Again when the reader's name changes, since offers show it.
  useEffect(() => {
    load();
  }, [slug, me.person.name]);

  async function change(path: string, method: string, body?: unknown): Promise<{ ok: boolean; name?: string; error?: string }> {
    setError("");
    const { status, data } = await api<{ name?: string; error?: string }>(slug, path, { method, body });
    if (status >= 300) {
      const message = data?.error ?? "Something went wrong. Please try again.";
      setError(message);
      if (status === 409) await load();
      return { ok: false, error: message };
    }
    // An offer can save the reader's name or email.
    reloadMe();
    await load();
    return { ok: true, name: data?.name };
  }

  if (!requests) return error ? <ErrorMessage>{error}</ErrorMessage> : null;
  const family = me.person.role === "family";

  return (
    <>
      <PageTitle>How to Help</PageTitle>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {family && <h3 className="text-lg font-semibold tracking-tight">What Would Help</h3>}
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
            needsPhone={request.requirePhone && me.person.role === "supporter" && me.person.phone === null}
            onSave={(fields) => change(`help/${request.id}`, "PATCH", fields).then((r) => r.ok)}
            onDelete={() => change(`help/${request.id}`, "DELETE").then((r) => r.ok)}
            onOffer={(helping, details) => change(`help/${request.id}/offer`, "POST", { helping, ...details }).then((r) => r.ok)}
            onRemove={(offerId) => change(`help/${request.id}/offers/${offerId}`, "DELETE").then((r) => r.ok)}
          />
        ))}
      </div>
    </>
  );
}

function RequestCard(props: {
  request: HelpRequest;
  family: boolean;
  needsName: boolean;
  needsEmail: boolean;
  needsPhone: boolean;
  onSave: (fields: RequestFields) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onOffer: (helping: boolean, details?: { name?: string; email?: string; phone?: string }) => Promise<boolean>;
  onRemove: (offerId: string) => Promise<boolean>;
}) {
  const { request } = props;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [asking, setAsking] = useState(false);
  const [bowingOut, setBowingOut] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const mine = request.offers.some((offer) => offer.mine);
  const past = isPast(request.date, request.time, new Date());
  const showButton = !request.full && !past && !mine;
  const needsDetails = props.needsName || props.needsEmail || props.needsPhone;

  async function offer(e: FormEvent) {
    e.preventDefault();
    // A name, email, or phone number the request needs is asked for only once they press the button.
    if (needsDetails && !asking) return setAsking(true);
    setPending(true);
    const ok = await props.onOffer(true, {
      ...(props.needsName && { name }),
      ...(props.needsEmail && { email }),
      ...(props.needsPhone && { phone }),
    });
    setPending(false);
    if (ok) {
      setName("");
      setEmail("");
      setPhone("");
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
              <EmailInput
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoFocus={!props.needsName}
              />
            </Field>
          )}
          {asking && props.needsPhone && (
            <Field label={<span>Your phone number <span className="font-normal text-muted-foreground">(only the family will see this)</span></span>}>
              <Input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={30}
                autoFocus={!props.needsName && !props.needsEmail}
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

// The family's list of who offered, with emails, phone numbers, and Remove.
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
            {offer.phone && (
              <span className="text-muted-foreground">
                {" · "}
                <PhoneLink phone={offer.phone} />
              </span>
            )}
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
  const [requirePhone, setRequirePhone] = useState(props.initial?.requirePhone ?? false);
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
      requirePhone,
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
      setRequirePhone(false);
      setDate("");
      setTime("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        maxLength={2000}
        rows={4}
        aria-label="What would help"
      />
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
      <Label>
        <Checkbox checked={requirePhone} onCheckedChange={(checked) => setRequirePhone(checked === true)} />
        Require phone
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
