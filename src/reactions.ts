import { reactionFor } from "./lib/reactionCatalog.js";

export type Reactions = {
  count: number;
  kinds: string[];
  mine: string | null;
  // The emoji anyone may pick here, in catalog order, as the server allows them.
  allowed: string[];
  named: { name: string; kind: string }[];
};

export function emoji(kind: string): string {
  return reactionFor(kind)?.emoji ?? "";
}

// "❤️🙏😂", the three most-used emoji.
export function summary(r: Reactions): string {
  return r.kinds.slice(0, 3).map(emoji).join("");
}

// The summary's accessible name, since its visible text has no count.
export function summaryLabel(r: Reactions): string {
  return `${r.count} ${r.count === 1 ? "reaction" : "reactions"}. Show who reacted`;
}

// One line per person who reacted: the viewer first as "You", then named people, then
// nameless readers counted at the end.
export function whoReacted(r: Reactions): string[] {
  const lines = [
    ...(r.mine ? [`You ${emoji(r.mine)}`] : []),
    ...r.named.map((p) => `${p.name} ${emoji(p.kind)}`),
  ];
  const others = r.count - lines.length;
  if (others > 0) {
    const n = others === 1 ? "1 other" : `${others} others`;
    lines.push(lines.length > 0 ? `and ${n}` : others === 1 ? "1 person" : `${others} people`);
  }
  return lines;
}
