// The six reactions, in tray order. The keys match the server's ReactionKind. `name` is
// only for screen readers; the page never shows it.
export const REACTIONS = [
  { kind: "heart", emoji: "❤️", name: "Heart" },
  { kind: "pray", emoji: "🙏", name: "Folded hands" },
  { kind: "hug", emoji: "🤗", name: "Hug" },
  { kind: "strong", emoji: "💪", name: "Flexed arm" },
  { kind: "party", emoji: "🎉", name: "Party popper" },
  { kind: "laugh", emoji: "😂", name: "Laughing" },
] as const;

export type Reactions = {
  count: number;
  kinds: string[];
  mine: string | null;
  named: { name: string; kind: string }[];
};

export function emoji(kind: string): string {
  return REACTIONS.find((r) => r.kind === kind)?.emoji ?? "";
}

// "7 reactions: ❤️🙏😂", with the three most-used emoji.
export function summary(r: Reactions): string {
  return `${r.count} ${r.count === 1 ? "reaction" : "reactions"}: ${r.kinds.slice(0, 3).map(emoji).join("")}`;
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
