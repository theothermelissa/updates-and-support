// The sentences under a request. Names are already in display order, with "You" first
// when the viewer has offered.

export function capacityLabel(slots: number | null): string {
  if (slots === null) return "Many people can help with this";
  return `${slots} ${slots === 1 ? "person" : "people"} can help with this`;
}

export function helpSummary(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} can help with this`;
  if (names.length === 2) return `${names[0]} and ${names[1]} can help with this`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]}, and ${others} ${others === 1 ? "other" : "others"} can help with this`;
}
