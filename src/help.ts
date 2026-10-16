// The count beside a request, given how many people have offered.
export function capacityLabel(slots: number | null, offered: number): string {
  if (slots === null) return "everyone";
  const people = `${slots} ${slots === 1 ? "person" : "people"}`;
  if (offered === 0 || offered >= slots) return people;
  return `${people}, need ${slots - offered} more`;
}

// A request's date and time on this device's clock, built from the parts so the day never
// shifts with the time zone.
function localMoment(date: string, time: string | null): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = time ? (time.split(":").map(Number) as [number, number]) : [0, 0];
  return new Date(y, m - 1, d, h, min);
}

// When a dated request becomes past: the next day's start for a date alone, its time otherwise.
function pastFrom(date: string, time: string | null): Date {
  const moment = localMoment(date, time);
  if (!time) moment.setDate(moment.getDate() + 1);
  return moment;
}

export function isPast(date: string | null, time: string | null, now: Date): boolean {
  return date !== null && now >= pastFrom(date, time);
}

// Upcoming dated requests soonest first (a date alone before times that day), then undated
// ones in the order given (oldest first), then past ones, most recently past first.
export function sortRequests<T extends { date: string | null; time: string | null }>(requests: T[], now: Date): T[] {
  const upcoming = requests.filter((r) => r.date !== null && !isPast(r.date, r.time, now));
  const undated = requests.filter((r) => r.date === null);
  const past = requests.filter((r) => isPast(r.date, r.time, now));
  const key = (r: T) => `${r.date} ${r.time ?? ""}`;
  upcoming.sort((a, b) => key(a).localeCompare(key(b)));
  past.sort((a, b) => pastFrom(b.date!, b.time).getTime() - pastFrom(a.date!, a.time).getTime());
  return [...upcoming, ...undated, ...past];
}

// "Fri, Oct 17", or "Fri, Oct 17 · 5:30 PM".
export function whenLabel(date: string, time: string | null): string {
  const moment = localMoment(date, time);
  const day = moment.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return time ? `${day} · ${moment.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : day;
}
