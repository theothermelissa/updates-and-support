import { useState } from "react";
import { BellCheckIcon, BellMinusIcon, ChevronDownIcon, FaceSlightlySmilingIcon, FaceSlightlySmilingPlusIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TRAY } from "@/components/reactions";
import { inCatalogOrder, isUsual, MAX_REACTIONS, reactionFor, REACTIONS, USUAL_REACTIONS } from "../lib/reactionCatalog.js";

// A button showing an update's settings as icons, which opens them below it.
// Closed when it mounts; the form remounts it (with a new key) to start fresh. Without
// onNotify, as when editing, it has only the reactions setting.
export function PostSettings(props: {
  notify?: boolean;
  onNotify?: (notify: boolean) => void;
  reactions: string[];
  onReactions: (kinds: string[]) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const { reactions, onReactions, disabled } = props;
  const [open, setOpen] = useState(false);
  // Unchecking "Use the usual reactions" shows the grid, starting from the usual six.
  const [choosing, setChoosing] = useState(!isUsual(reactions));
  const full = reactions.length >= MAX_REACTIONS;

  const usual = !choosing;

  function toggle(kind: string) {
    onReactions(reactions.includes(kind) ? reactions.filter((k) => k !== kind) : inCatalogOrder([...reactions, kind]));
  }

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
          {props.onNotify && (
            <SettingIcon label={props.notify ? "Emails supporters" : "No email"}>
              {props.notify ? <BellCheckIcon /> : <BellMinusIcon />}
            </SettingIcon>
          )}
          <SettingIcon label={usual ? "Usual reactions" : "Chosen reactions"}>
            {usual ? <FaceSlightlySmilingIcon /> : <FaceSlightlySmilingPlusIcon />}
          </SettingIcon>
          <ChevronDownIcon aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {open && (
        <div className="space-y-4 rounded-lg border p-4">
          {props.onNotify && (
            <Label>
              <Checkbox
                checked={props.notify}
                onCheckedChange={(checked) => props.onNotify!(checked === true)}
                disabled={disabled}
              />
              Notify supporters by email
            </Label>
          )}
          <Label>
            <Checkbox
              checked={!choosing}
              onCheckedChange={(checked) => {
                setChoosing(checked !== true);
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
