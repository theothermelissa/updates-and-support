// The count beside a request, given how many people have offered.
export function capacityLabel(slots: number | null, offered: number): string {
  if (slots === null) return "everyone";
  const people = `${slots} ${slots === 1 ? "person" : "people"}`;
  if (offered === 0 || offered >= slots) return people;
  return `${people}, need ${slots - offered} more`;
}
