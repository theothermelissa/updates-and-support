import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { REACTIONS, summary, summaryLabel, whoReacted, type Reactions as ReactionsData } from "../reactions.js";

const HOVER_DELAY = 300;

// A React button that opens the six emoji, and a summary ("❤️🤗👏") that shows who reacted.
// On an update the tray floats above the button and a mouse hover opens it. On a note it
// opens inside the card, from a click, a tap, or the keyboard, so the wall's columns neither
// clip it nor resize as the pointer moves across them.
export function ReactionControls(props: {
  reactions: ReactionsData;
  onReact: (kind: string | null) => Promise<boolean>;
  placement: "floating" | "inline";
  children?: ReactNode;
}) {
  const r = props.reactions;
  const inline = props.placement === "inline";
  const [tray, setTray] = useState(false);
  const [names, setNames] = useState<"closed" | "hover" | "pinned">("closed");
  const [pending, setPending] = useState(false);
  const area = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // The button and tray share one hover area, and the delay lets the pointer cross to the tray.
  // Touch has no hover, so it's ignored here and a tap opens the tray instead.
  function hoverTray(e: PointerEvent, open: boolean) {
    if (inline || e.pointerType !== "mouse") return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTray(open), HOVER_DELAY);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!tray) return;
    const outside = (e: globalThis.PointerEvent) => {
      if (!area.current?.contains(e.target as Node)) setTray(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTray(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [tray]);

  async function pick(kind: string) {
    window.clearTimeout(timer.current);
    setTray(false);
    setPending(true);
    await props.onReact(kind === r.mine ? null : kind);
    setPending(false);
  }

  const mine = REACTIONS.find((x) => x.kind === r.mine);
  const emojiButtons = (
    <span
      className={cn(
        "flex gap-0.5 border bg-popover p-1 text-popover-foreground shadow-md",
        inline ? "mt-1 max-w-full flex-wrap rounded-xl" : "absolute bottom-full left-0 z-10 mb-1 rounded-full",
      )}
      role="group"
      aria-label="Pick a reaction"
    >
      {REACTIONS.map((x) => (
        <button
          key={x.kind}
          type="button"
          className="size-11 rounded-full text-[1.6rem] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:ring-2 aria-pressed:ring-foreground"
          aria-label={x.name}
          aria-pressed={x.kind === r.mine}
          onClick={() => pick(x.kind)}
        >
          {x.emoji}
        </button>
      ))}
    </span>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn("relative", inline && "flex flex-col")}
          ref={area}
          onPointerEnter={(e) => hoverTray(e, true)}
          onPointerLeave={(e) => hoverTray(e, false)}
        >
          {inline ? (
            <button
              ref={button}
              type="button"
              className={cn(
                "inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                mine ? "text-2xl" : "text-sm underline underline-offset-2",
              )}
              aria-label={mine ? `Your reaction: ${mine.name}. Change it` : "React"}
              aria-expanded={tray}
              disabled={pending}
              onClick={() => setTray(true)}
            >
              {mine ? mine.emoji : "React"}
            </button>
          ) : (
            <Button
              ref={button}
              variant="outline"
              className={cn("h-11 min-w-11 rounded-full px-4", mine && "border-foreground bg-muted text-2xl")}
              aria-label={mine ? `Your reaction: ${mine.name}. Change it` : "React"}
              aria-expanded={tray}
              disabled={pending}
              onClick={() => {
                window.clearTimeout(timer.current);
                setTray(true);
              }}
            >
              {mine ? mine.emoji : "React"}
            </Button>
          )}
          {tray && emojiButtons}
        </span>
        {r.count > 0 &&
          (inline ? (
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-sm px-1 text-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={summaryLabel(r)}
              aria-expanded={names === "pinned"}
              onClick={() => setNames((n) => (n === "pinned" ? "closed" : "pinned"))}
            >
              {summary(r)}
            </button>
          ) : (
            <span
              className="relative"
              onPointerEnter={(e) => e.pointerType === "mouse" && setNames((n) => (n === "pinned" ? n : "hover"))}
              onPointerLeave={() => setNames((n) => (n === "hover" ? "closed" : n))}
            >
              <button
                type="button"
                className="rounded-sm py-2 text-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={summaryLabel(r)}
                aria-expanded={names === "pinned"}
                onClick={() => setNames((n) => (n === "pinned" ? "closed" : "pinned"))}
              >
                {summary(r)}
              </button>
              {names === "hover" && (
                <NameList
                  r={r}
                  className="absolute top-full left-0 z-10 rounded-md bg-foreground px-3 py-1.5 text-sm whitespace-nowrap text-background"
                />
              )}
            </span>
          ))}
        {props.children}
      </div>
      {names === "pinned" && <NameList r={r} className={inline ? "text-sm" : "text-sm text-muted-foreground"} />}
    </div>
  );
}

function NameList({ r, className }: { r: ReactionsData; className: string }) {
  return (
    <ul className={className}>
      {whoReacted(r).map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}
