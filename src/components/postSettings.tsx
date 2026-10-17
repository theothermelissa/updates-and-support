import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CATALOG, inCatalogOrder, isUsual, MAX_REACTIONS, USUAL_REACTIONS } from "../lib/reactionCatalog.js";

// A button showing a one-line summary of an update's settings, which opens them below it.
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

  const parts = [
    props.onNotify && (props.notify ? "Emails supporters" : "No email"),
    reactionsSummary(reactions),
  ].filter(Boolean);

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
          className="h-auto min-h-9 min-w-0 shrink text-left whitespace-normal text-muted-foreground"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span>
            <span className="font-medium text-foreground">Post settings</span> · {parts.join(" · ")}
          </span>
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
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {reactions.length} of {MAX_REACTIONS} chosen
              </p>
              {CATALOG.map((group) => (
                <fieldset key={group.group}>
                  <legend className="mb-1 text-xs font-medium text-muted-foreground">{group.group}</legend>
                  <div className="flex flex-wrap gap-0.5">
                    {group.reactions.map((x) => {
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
                </fieldset>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function reactionsSummary(kinds: string[]): string {
  if (isUsual(kinds)) return "Usual reactions";
  if (kinds.length === 0) return "No reactions";
  return kinds.length === 1 ? "1 reaction" : `${kinds.length} reactions`;
}
