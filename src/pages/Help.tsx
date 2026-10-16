import { CheckIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Confirm, ErrorMessage, Field, LinkedText, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type Me } from "../api.js";
import { capacityLabel, helpSummary } from "../help.js";

type Offer = { id: string | null; name: string; mine: boolean; email: string | null };
type HelpRequest = { id: string; body: string; slots: number | null; full: boolean; offers: Offer[] };

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
      {family && (
        <RequestForm
          submitLabel="Add request"
          onSubmit={(body, slots) => change("help", "POST", { body, slots }).then((r) => r.ok)}
        />
      )}
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
  const [names, setNames] = useState<"closed" | "hover" | "pinned">("closed");
  const [removing, setRemoving] = useState<string | null>(null);
  const mine = request.offers.some((offer) => offer.mine);
  const shown = request.offers.map((offer) => (offer.mine ? "You" : offer.name));
  const summary = helpSummary(shown);
  const listAlways = request.slots === null || props.family;
  const showButton = !request.full || mine;

  async function offer(e: FormEvent) {
    e.preventDefault();
    if (!mine && props.needsName && name.trim() === "") return;
    setPending(true);
    const ok = await props.onOffer(!mine, props.needsName && !mine ? name : undefined);
    setPending(false);
    if (ok) setName("");
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
        <>
          <LinkedText text={request.body} />
          <p className="text-sm text-muted-foreground">{capacityLabel(request.slots)}</p>
        </>
      )}
      {summary && (
        <div className="space-y-2">
          <p className="flex items-start gap-2">
            {request.full && <CheckIcon className="mt-0.5 size-5 shrink-0 text-green-800" role="img" aria-label="Covered" />}
            {listAlways ? (
              <span>{summary}</span>
            ) : (
              <span
                className="relative"
                onPointerEnter={(e) => e.pointerType === "mouse" && setNames((n) => (n === "pinned" ? n : "hover"))}
                onPointerLeave={() => setNames((n) => (n === "hover" ? "closed" : n))}
              >
                <button
                  type="button"
                  className="rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={`${summary}. Show who can help`}
                  aria-expanded={names === "pinned"}
                  onClick={() => setNames((n) => (n === "pinned" ? "closed" : "pinned"))}
                >
                  {summary}
                </button>
                {names === "hover" && (
                  <ul className="absolute top-full left-0 z-10 mt-1 w-max max-w-xs rounded-md bg-foreground px-3 py-1.5 text-sm text-background">
                    {shown.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </span>
            )}
          </p>
          {listAlways && <OfferList offers={request.offers} family={props.family} removing={removing} setRemoving={setRemoving} onRemove={props.onRemove} />}
          {!listAlways && names === "pinned" && (
            <OfferList offers={request.offers} family={false} removing={null} setRemoving={setRemoving} onRemove={props.onRemove} />
          )}
        </div>
      )}
      {showButton && !editing && (
        <form onSubmit={offer} className="space-y-3">
          {props.needsName && !mine && (
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </Field>
          )}
          <Button type="submit" variant="outline" disabled={pending} aria-pressed={mine} className={mine ? "border-foreground bg-muted" : ""}>
            {mine ? "I'm helping with this" : "I can help with this"}
          </Button>
        </form>
      )}
      {props.family && !editing && (
        confirming ? (
          <Confirm yes="Yes, delete" onYes={props.onDelete} onCancel={() => setConfirming(false)}>
            Delete this request? People who offered to help will no longer be listed.
          </Confirm>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        )
      )}
    </article>
  );
}

function OfferList(props: {
  offers: Offer[];
  family: boolean;
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
            {props.family && offer.email && <span className="text-muted-foreground"> · {offer.email}</span>}
            {props.family && offer.id && props.removing !== offer.id && (
              <button type="button" className="ml-3 underline underline-offset-2" onClick={() => props.setRemoving(offer.id)}>
                Remove
              </button>
            )}
          </p>
          {props.family && offer.id && props.removing === offer.id && (
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
        Many people can help with this
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
