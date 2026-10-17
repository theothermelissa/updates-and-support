import { CheckIcon, EllipsisVerticalIcon, XIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import type { Doc } from "../lib/doc.js";
import { RichText } from "../richText.js";
import { capacityLabel, isPast, sortRequests, whenLabel } from "../help.js";
import type { FamilyPageProps } from "./FamilyFrame.js";

const RichEditor = lazy(() => import("../editor/RichEditor.js"));

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
// resolvedAt is when a family member marked it resolved, as ISO; null while it's open.
type HelpRequest = RequestFields & { id: string; full: boolean; resolvedAt: string | null; offered: number; offers: Offer[] };
// The family's message: the introduction, and the "Do" and "Don't" parts. Null when not written.
type MessageParts = { message: Doc | null; dos: Doc | null; donts: Doc | null };
const NO_MESSAGE: MessageParts = { message: null, dos: null, donts: null };

export function Help({ slug, me, reloadMe }: FamilyPageProps) {
  const [requests, setRequests] = useState<HelpRequest[] | null>(null);
  const [message, setMessage] = useState<MessageParts>(NO_MESSAGE);
  const [error, setError] = useState("");

  async function load() {
    const list = await api<MessageParts & { requests: HelpRequest[] }>(slug, "help");
    if (list.status === 401) return location.replace(`/f/${slug}`);
    if (list.status !== 200) return setError("Couldn't load ways to help. Please refresh the page.");
    setMessage({ message: list.data.message ?? null, dos: list.data.dos ?? null, donts: list.data.donts ?? null });
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
      <HelpMessage
        slug={slug}
        message={message}
        family={family}
        onSave={(parts) =>
          change("help-message", "PUT", { content: parts.message, dos: parts.dos, donts: parts.donts }).then((r) => r.ok)
        }
      />
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
            onResolve={(resolved) => change(`help/${request.id}/resolve`, "POST", { resolved })}
            onOffer={(helping, details) => change(`help/${request.id}/offer`, "POST", { helping, ...details }).then((r) => r.ok)}
            onRemove={(offerId) => change(`help/${request.id}/offers/${offerId}`, "DELETE").then((r) => r.ok)}
          />
        ))}
      </div>
    </>
  );
}

// The family's message at the top of the page: an introduction, then "Do:" and "Don't:" parts in
// shaded boxes, each shown only when written. Family members write, change, or remove all three
// at once here with the update editor, without photos; saving a part empty removes it.
function HelpMessage(props: {
  slug: string;
  message: MessageParts;
  family: boolean;
  onSave: (parts: MessageParts) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MessageParts>(props.message);
  const [busy, setBusy] = useState(false);
  const { message, dos, donts } = props.message;

  function edit() {
    setDraft(props.message);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await props.onSave(draft);
    setBusy(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    const editor = (part: keyof MessageParts, label: string, placeholder?: string) => (
      <Suspense fallback={<div className="h-[12.5rem] rounded-lg border border-input" aria-busy="true" />}>
        <RichEditor
          initial={props.message[part] ?? undefined}
          slug={props.slug}
          photos="off"
          label={label}
          placeholder={placeholder}
          onChange={(doc) => setDraft((d) => ({ ...d, [part]: doc as Doc | null }))}
        />
      </Suspense>
    );
    return (
      <form onSubmit={save} className="space-y-4">
        {editor("message", "Introduction", INTRO_HINT)}
        <MessageHeading>Do:</MessageHeading>
        {editor("dos", "Do")}
        <MessageHeading>Don't:</MessageHeading>
        {editor("donts", "Don't")}
        <div className="flex gap-2">
          <Button disabled={busy}>Save</Button>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }
  if (message === null && dos === null && donts === null) {
    return props.family ? (
      <div>
        <Button type="button" variant="outline" onClick={edit}>
          Add a message for supporters
        </Button>
      </div>
    ) : null;
  }
  // Edit sits at the top right of whichever part comes first.
  const editButton = props.family ? (
    <Button type="button" variant="ghost" size="sm" className="-mr-2" onClick={edit}>
      Edit
    </Button>
  ) : null;
  return (
    <div className="space-y-4">
      {message && (
        <div className="flex items-start gap-2">
          <RichText doc={message} className="min-w-0 flex-1" />
          {editButton}
        </div>
      )}
      {dos && <MessageBox heading="Do:" doc={dos} action={message ? null : editButton} />}
      {donts && <MessageBox heading="Don't:" doc={donts} action={message || dos ? null : editButton} />}
    </div>
  );
}

const INTRO_HINT = "Thank you for your care and support! We deeply appreciate it, and are so grateful for you all.";

function MessageHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

function MessageBox(props: { heading: string; doc: Doc; action: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <MessageHeading>{props.heading}</MessageHeading>
        {props.action}
      </div>
      <div className="rounded-xl bg-muted p-4">
        <RichText doc={props.doc} />
      </div>
    </section>
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
  onResolve: (resolved: boolean) => void;
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
  const resolved = request.resolvedAt !== null;
  const done = request.full || resolved;
  const showButton = !done && !past && !mine;
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
          {done && (
            <CheckIcon className="mt-0.5 size-5 shrink-0 text-green-800" role="img" aria-label={resolved ? "Resolved" : "Covered"} />
          )}
          {/* The count is inline-block, so the line through a covered, resolved, or past request skips it. */}
          <div className="min-w-0 flex-1">
            {request.date && <p className="text-sm text-muted-foreground">{whenLabel(request.date, request.time)}</p>}
            <LinkedText text={request.body} className={done || past ? "line-through" : ""}>
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
                <DropdownMenuItem onSelect={() => props.onResolve(!resolved)}>
                  {resolved ? "Reopen" : "Mark as resolved"}
                </DropdownMenuItem>
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
            {/* Once the fields it needs are showing, the same button makes the offer. */}
            {asking ? (
              <Button type="submit" disabled={pending}>
                Confirm
              </Button>
            ) : (
              <Button type="submit" variant="outline" disabled={pending}>
                <span aria-hidden="true">✋</span>I can help with this
              </Button>
            )}
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
