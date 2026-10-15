// The six reactions, in display order. The keys match the server's ReactionKind.
export const REACTIONS = [
  { kind: "heart", emoji: "❤️", label: "Love" },
  { kind: "pray", emoji: "🙏", label: "Thinking of you" },
  { kind: "hug", emoji: "🤗", label: "Hug" },
  { kind: "strong", emoji: "💪", label: "You've got this" },
  { kind: "party", emoji: "🎉", label: "Celebrate" },
  { kind: "laugh", emoji: "😂", label: "That made me laugh" },
] as const;

// Names who reacted, with the viewer as "You" first, and everyone else (nameless readers and
// anyone past `limit`) counted: "You, Ana Rivera and 4 others". `total` counts everyone.
export function whoReacted(names: string[], you: boolean, total: number, limit = Infinity): string {
  const shown = (you ? ["You", ...names] : names).slice(0, limit);
  const others = total - shown.length;
  if (shown.length === 0) return others === 1 ? "1 person" : `${others} people`;
  const parts = others > 0 ? [...shown, others === 1 ? "1 other" : `${others} others`] : shown;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
