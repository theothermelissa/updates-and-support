import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { HeartPlusIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { inCatalogOrder, reactionFor } from "../lib/reactionCatalog.js";
import { summary, summaryLabel, whoReacted, type Reactions as ReactionsData } from "../reactions.js";

const HOVER_DELAY = 300;

// The tray's look, shared with its preview in Post settings.
export const TRAY = "flex w-max gap-0.5 rounded-full border bg-popover p-1 text-popover-foreground shadow-md";

// A React button that opens a tray of the emoji allowed here, and a summary ("❤️🤗👏") that shows who
// reacted. With a mouse, hovering opens either one; on a phone, tapping does. The tray and the
// hover list are drawn on the page, not inside the card, so the wall's columns can't clip them.
export function ReactionControls(props: {
  reactions: ReactionsData;
  onReact: (kind: string | null) => Promise<boolean>;
  children?: ReactNode;
  below?: ReactNode;
}) {
  const r = props.reactions;
  const [trayOpen, setTray] = useState(false);
  const [names, setNames] = useState<RevealState>("closed");
  const [pending, setPending] = useState(false);
  const area = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const trayNode = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // The button and tray share one hover area, and the delay lets the pointer cross to the tray.
  // Touch has no hover, so it's ignored here and a tap opens the tray instead.
  function hoverTray(e: PointerEvent, open: boolean) {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTray(open), HOVER_DELAY);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!trayOpen) return;
    const outside = (e: globalThis.PointerEvent) => {
      const target = e.target as Node;
      if (area.current?.contains(target) || trayNode.current?.contains(target)) return;
      setTray(false);
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
  }, [trayOpen]);

  async function pick(kind: string) {
    window.clearTimeout(timer.current);
    setTray(false);
    setPending(true);
    await props.onReact(kind === r.mine ? null : kind);
    setPending(false);
  }

  const mine = r.mine ? reactionFor(r.mine) : undefined;
  // What the server allows, plus the viewer's own when the set no longer has it, so it can be
  // taken back. With nothing to pick, there's no React button.
  const tray = inCatalogOrder(r.mine && !r.allowed.includes(r.mine) ? [...r.allowed, r.mine] : r.allowed).flatMap(
    (kind) => reactionFor(kind) ?? [],
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {tray.length > 0 && (
          <span
            className="relative"
            ref={area}
            onPointerEnter={(e) => hoverTray(e, true)}
            onPointerLeave={(e) => hoverTray(e, false)}
          >
            <Button
              ref={button}
              variant="outline"
              className={cn("h-11 min-w-11 rounded-full px-4 text-foreground", mine ? "border-foreground bg-muted text-2xl" : "px-0 [&_svg]:size-5")}
              aria-label={mine ? `Your reaction: ${mine.name}. Change it` : "React"}
              aria-expanded={trayOpen}
              disabled={pending}
              onClick={() => {
                window.clearTimeout(timer.current);
                setTray(true);
              }}
            >
              {mine ? mine.emoji : <HeartPlusIcon aria-hidden />}
            </Button>
            <Floating
              anchor={area.current}
              open={trayOpen}
              side="above"
              nodeRef={trayNode}
              className={TRAY}
              role="group"
              aria-label="Pick a reaction"
              onPointerEnter={(e) => hoverTray(e, true)}
              onPointerLeave={(e) => hoverTray(e, false)}
            >
              {tray.map((x) => (
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
            </Floating>
          </span>
        )}
        {r.count > 0 && <Summary r={r} names={names} setNames={setNames} />}
        {props.children}
      </div>
      {names === "pinned" && <NameList r={r} className="text-sm text-muted-foreground" />}
      {props.below}
    </div>
  );
}

export type RevealState = "closed" | "hover" | "pinned";

// The reactor summary shown with its list of who reacted.
function Summary(props: { r: ReactionsData; names: RevealState; setNames: (next: RevealState | ((n: RevealState) => RevealState)) => void }) {
  const { r } = props;
  return (
    <Reveal
      state={props.names}
      setState={props.setNames}
      className="rounded-sm py-2 text-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      label={summaryLabel(r)}
      trigger={summary(r)}
      content={<NameList r={r} className="" />}
    />
  );
}

// A button whose details float beside it while a mouse rests on it, and that a tap or click
// pins open (the caller draws the pinned details, under its row) or closes again.
export function Reveal(props: {
  state: RevealState;
  setState: (next: RevealState | ((n: RevealState) => RevealState)) => void;
  className: string;
  style?: React.CSSProperties;
  label: string;
  trigger: ReactNode;
  content: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  const { state, setState } = props;
  function leave(e: PointerEvent) {
    const next = e.relatedTarget;
    if (next instanceof Node && (anchor.current?.contains(next) || list.current?.contains(next))) return;
    setState((n) => (n === "hover" ? "closed" : n));
  }
  return (
    <span
      className="relative"
      ref={anchor}
      onPointerEnter={(e) => e.pointerType === "mouse" && setState((n) => (n === "pinned" ? n : "hover"))}
      onPointerLeave={leave}
    >
      <button
        type="button"
        className={props.className}
        style={props.style}
        aria-label={props.label}
        aria-expanded={state === "pinned"}
        onClick={() => setState((n) => (n === "pinned" ? "closed" : "pinned"))}
      >
        {props.trigger}
      </button>
      <Floating
        anchor={anchor.current}
        open={state === "hover"}
        side="below"
        gap={0}
        nodeRef={list}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm whitespace-nowrap text-background"
        onPointerLeave={leave}
      >
        {props.content}
      </Floating>
    </span>
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

// Draws its children over the page, next to `anchor`, so a card or a column can't clip them.
// Above the anchor, or below it when the top of the screen is too close.
function Floating(props: {
  anchor: HTMLElement | null;
  open: boolean;
  side: "above" | "below";
  gap?: number;
  className: string;
  children: ReactNode;
  nodeRef?: Ref<HTMLSpanElement>;
  role?: string;
  "aria-label"?: string;
  onPointerEnter?: (e: PointerEvent<HTMLSpanElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLSpanElement>) => void;
}) {
  const local = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", top: 0, left: 0, visibility: "hidden" });
  const { anchor, open, side } = props;
  const gap = props.gap ?? 4;

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const el = local.current;
    if (!el) return;
    function place() {
      if (!el || !anchor) return;
      const a = anchor.getBoundingClientRect();
      const f = el.getBoundingClientRect();
      const margin = 8;
      let top = side === "above" ? a.top - f.height - gap : a.bottom + gap;
      let left = a.left;
      if (left + f.width > window.innerWidth - margin) left = window.innerWidth - margin - f.width;
      if (left < margin) left = margin;
      if (top < margin) top = a.bottom + gap;
      if (top + f.height > window.innerHeight - margin) top = Math.max(margin, a.top - f.height - gap);
      setStyle({ position: "fixed", top, left, zIndex: 50 });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchor, side, gap]);

  if (!open || !anchor) return null;
  return createPortal(
    <span
      ref={(node) => {
        local.current = node;
        const passed = props.nodeRef;
        if (typeof passed === "function") passed(node);
        else if (passed) passed.current = node;
      }}
      style={style}
      className={props.className}
      role={props.role}
      aria-label={props["aria-label"]}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
    >
      {props.children}
    </span>,
    document.body,
  );
}
