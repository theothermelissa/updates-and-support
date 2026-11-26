import { useId, useState } from "react";
import {
  BellCheckIcon,
  BellMinusIcon,
  ChevronDownIcon,
  FaceSlightlySmilingIcon,
  FaceSlightlySmilingPlusIcon,
  GlobeIcon,
  LockIcon,
  MessageSquareIcon,
  MessageSquareOffIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TRAY } from "@/components/reactions";
import type { AudienceChoice, Group } from "../audience.js";
import { inCatalogOrder, isUsual, MAX_REACTIONS, reactionFor, REACTIONS, USUAL_REACTIONS } from "../lib/reactionCatalog.js";

// A button showing an update's settings as icons, which opens them below it.
// Closed when it mounts; the form remounts it (with a new key) to start fresh. Without
// onNotify, as when editing, it has no notify setting. "Who can see this" shows once the family
// has a group or the audience isn't everyone, always on an invite-only family, and whenever Public
// is offered (offerPublic: an admin of a family with public updates on); without onAudience it
// never shows. A public update seen by someone who can't offer Public shows it selected and locked.
// publicAck: the "I understand" box, given only while the update isn't already public.
export function PostSettings(props: {
  groups?: Group[];
  inviteOnly?: boolean;
  audience?: AudienceChoice;
  onAudience?: (audience: AudienceChoice) => void;
  offerPublic?: boolean;
  publicAck?: { checked: boolean; onChange: (checked: boolean) => void };
  notify?: boolean;
  onNotify?: (notify: boolean) => void;
  reactions: string[];
  onReactions: (kinds: string[]) => void;
  allowNotes: boolean;
  onAllowNotes: (allow: boolean) => void;
  // The posted-date setting; absent while photos are off.
  posted?: PostedDateProps;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const { reactions, onReactions, disabled } = props;
  const [open, setOpen] = useState(false);
  // Unchecking "Use the usual reactions" shows the grid, starting from the usual six.
  const [choosing, setChoosing] = useState(!isUsual(reactions));
  const usual = !choosing;
  const groups = props.groups ?? [];
  const audience = props.onAudience ? props.audience : undefined;
  const inviteOnly = props.inviteOnly ?? false;
  const choosingAudience =
    audience !== undefined &&
    (inviteOnly || groups.length > 0 || audience.mode !== "everyone" || props.offerPublic === true);
  const toGroups = choosingAudience && audience.mode === "groups";
  const toFamily = choosingAudience && audience.mode === "family";
  // An invite-only family can always choose Family members only. Elsewhere it stays a choice
  // only for an update that already has it.
  const [offerFamily] = useState(inviteOnly || audience?.mode === "family");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {props.children}
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="font-medium text-foreground">Post settings</span>
          {choosingAudience && (
            <SettingIcon label={AUDIENCE_LABELS[audience.mode]}>
              {audience.mode === "everyone" ? <UsersIcon /> : audience.mode === "public" ? <GlobeIcon /> : <LockIcon />}
            </SettingIcon>
          )}
          {props.onNotify && (
            <SettingIcon
              label={
                props.notify
                  ? toGroups
                    ? "Emails these groups"
                    : toFamily
                      ? "Emails family members"
                      : "Emails everyone"
                  : "No email"
              }
            >
              {props.notify ? <BellCheckIcon /> : <BellMinusIcon />}
            </SettingIcon>
          )}
          <SettingIcon label={usual ? "Usual reactions" : "Chosen reactions"}>
            {usual ? <FaceSlightlySmilingIcon /> : <FaceSlightlySmilingPlusIcon />}
          </SettingIcon>
          <SettingIcon label={props.allowNotes ? "Allows notes" : "No notes"}>
            {props.allowNotes ? <MessageSquareIcon /> : <MessageSquareOffIcon />}
          </SettingIcon>
          <ChevronDownIcon aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {open && (
        <div className="space-y-4 rounded-lg border p-4">
          {choosingAudience && (
            <AudienceChooser
              groups={groups}
              audience={audience}
              onAudience={props.onAudience!}
              offerFamily={offerFamily}
              familyFirst={inviteOnly}
              offerPublic={props.offerPublic === true}
              publicAck={props.publicAck}
              disabled={disabled}
            />
          )}
          {props.onNotify && (
            <Label>
              <Checkbox
                checked={props.notify}
                onCheckedChange={(checked) => props.onNotify!(checked === true)}
                disabled={disabled}
              />
              {toGroups
                ? "Notify these groups by email"
                : toFamily
                  ? "Notify family members by email"
                  : "Notify everyone by email"}
            </Label>
          )}
          <ReactionChooser
            reactions={reactions}
            onReactions={onReactions}
            choosing={choosing}
            onChoosing={setChoosing}
            disabled={disabled}
          />
          <Label>
            <Checkbox
              checked={props.allowNotes}
              onCheckedChange={(checked) => props.onAllowNotes(checked === true)}
              disabled={disabled}
            />
            Allow notes
          </Label>
          {props.posted && <PostedDate {...props.posted} disabled={disabled} />}
        </div>
      )}
    </>
  );
}

// "Use the date from my photos", and the Posted date and time it fills in. The field shows
// while the box is checked, and always when editing, since an update's date can be changed.
export type PostedDateProps = {
  on: boolean;
  onOn: (on: boolean) => void;
  // A datetime-local value.
  value: string;
  onValue: (value: string) => void;
  noneFound: boolean;
  showField: boolean;
};

function PostedDate(props: PostedDateProps & { disabled?: boolean }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label>
        <Checkbox
          checked={props.on}
          onCheckedChange={(checked) => props.onOn(checked === true)}
          disabled={props.disabled}
        />
        Use the date from my photos
      </Label>
      {props.on && props.noneFound && (
        <p className="text-sm text-muted-foreground" role="status">
          No photo has a date yet. Set one below.
        </p>
      )}
      {(props.on || props.showField) && (
        <div className="space-y-1">
          <Label htmlFor={id}>Posted</Label>
          <Input
            id={id}
            type="datetime-local"
            className="h-11 w-auto"
            min="1900-01-01T00:00"
            value={props.value}
            onChange={(e) => props.onValue(e.target.value)}
            disabled={props.disabled}
          />
        </div>
      )}
    </div>
  );
}

const AUDIENCE_LABELS = {
  everyone: "Everyone",
  groups: "Only some groups",
  family: "Family members only",
  public: "Public",
} as const;

// "Who can see this": Everyone, or Only these groups with a checkbox per group, plus Family
// members only when offerFamily: right after Everyone when familyFirst (an invite-only family),
// otherwise last. The checked groups are kept while another choice is selected.
function AudienceChooser(props: {
  groups: Group[];
  audience: AudienceChoice;
  onAudience: (audience: AudienceChoice) => void;
  offerFamily: boolean;
  familyFirst: boolean;
  offerPublic: boolean;
  publicAck?: { checked: boolean; onChange: (checked: boolean) => void };
  disabled?: boolean;
}) {
  const { groups, audience, onAudience } = props;
  // A public update's audience is only an admin's to change, so anyone else sees it locked.
  const locked = audience.mode === "public" && !props.offerPublic;
  const disabled = props.disabled || locked;
  const name = useId();
  const choose = (mode: AudienceChoice["mode"]) => onAudience({ ...audience, mode });
  const toggle = (id: string, on: boolean) =>
    onAudience({ ...audience, ids: on ? [...audience.ids, id] : audience.ids.filter((x) => x !== id) });
  const family = props.offerFamily && (
    <Label>
      <Radio name={name} checked={audience.mode === "family"} onChange={() => choose("family")} disabled={disabled} />
      Family members only
    </Label>
  );

  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm font-medium">Who can see this</legend>
      <Label>
        <Radio name={name} checked={audience.mode === "everyone"} onChange={() => choose("everyone")} disabled={disabled} />
        Everyone
      </Label>
      {props.familyFirst && family}
      {groups.length > 0 && (
        <Label>
          <Radio name={name} checked={audience.mode === "groups"} onChange={() => choose("groups")} disabled={disabled} />
          Only these groups
        </Label>
      )}
      {audience.mode === "groups" && (
        <div className="space-y-3 pl-6">
          {groups.map((g) => (
            <Label key={g.id} className="leading-snug">
              <Checkbox
                checked={audience.ids.includes(g.id)}
                onCheckedChange={(checked) => toggle(g.id, checked === true)}
                disabled={disabled}
              />
              <span className="min-w-0 break-words">{g.name}</span>
            </Label>
          ))}
        </div>
      )}
      {!props.familyFirst && family}
      {(props.offerPublic || audience.mode === "public") && (
        <Label>
          <Radio name={name} checked={audience.mode === "public"} onChange={() => choose("public")} disabled={disabled} />
          Public
        </Label>
      )}
      {audience.mode === "public" && props.publicAck && (
        <div className="space-y-3 pl-6">
          <p className="text-sm">
            Anyone who visits this family's address can read this update without signing in. Once someone has read
            it, you can't take it back from them.
          </p>
          <Label>
            <Checkbox
              checked={props.publicAck.checked}
              onCheckedChange={(checked) => props.publicAck!.onChange(checked === true)}
              disabled={props.disabled}
            />
            I understand
          </Label>
        </div>
      )}
      {locked && <p className="pl-6 text-sm text-muted-foreground">Only an admin can change who can see a public update.</p>}
    </fieldset>
  );
}

// A native radio button, sized and colored to match the checkboxes.
export function Radio(props: { name: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <input type="radio" className="size-4 shrink-0 accent-primary disabled:opacity-50" {...props} />;
}

// "Use the usual reactions," and when it's unchecked, a tray preview and the whole catalog as
// one grid, up to six. The owner keeps `choosing` (start it as !isUsual(reactions)), so it
// survives the chooser closing. Post settings and the People page's note reactions use it.
export function ReactionChooser(props: {
  reactions: string[];
  onReactions: (kinds: string[]) => void;
  choosing: boolean;
  onChoosing: (choosing: boolean) => void;
  disabled?: boolean;
}) {
  const { reactions, onReactions, choosing, disabled } = props;
  const full = reactions.length >= MAX_REACTIONS;

  function toggle(kind: string) {
    onReactions(reactions.includes(kind) ? reactions.filter((k) => k !== kind) : inCatalogOrder([...reactions, kind]));
  }

  return (
    <>
      <Label>
        <Checkbox
          checked={!choosing}
          onCheckedChange={(checked) => {
            props.onChoosing(checked !== true);
            if (checked === true) onReactions([...USUAL_REACTIONS]);
          }}
          disabled={disabled}
        />
        Use the usual reactions
      </Label>
      {choosing && (
        <div className="space-y-3">
          <div className="flex min-h-13 items-center">
            <span className="sr-only" aria-live="polite">
              {reactions.length} of {MAX_REACTIONS} chosen
            </span>
            {reactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reactions</p>
            ) : (
              <div className={TRAY} aria-hidden>
                {reactions.map((kind) => (
                  <span key={kind} className="grid size-11 place-items-center text-[1.6rem]">
                    {reactionFor(kind)?.emoji}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REACTIONS.map((x) => {
              const on = reactions.includes(x.kind);
              return (
                <button
                  key={x.kind}
                  type="button"
                  className="size-11 rounded-full text-[1.6rem] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 disabled:hover:bg-transparent aria-pressed:bg-muted aria-pressed:ring-2 aria-pressed:ring-foreground"
                  aria-label={x.name}
                  aria-pressed={on}
                  disabled={disabled || (full && !on)}
                  onClick={() => toggle(x.kind)}
                >
                  {x.emoji}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// An icon that says what it means to screen readers, and on hover.
function SettingIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span title={label} className="flex">
      <span aria-hidden className="flex">{children}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
