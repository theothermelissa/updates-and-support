import { RequestError } from "./errors.js";

const EARLIEST = Date.parse("1900-01-01T00:00:00Z");
const BAD = "Choose a date between 1900 and now.";

// The date a family member chose for an update, as an ISO string. Absent means "leave it".
// Anything unparseable, before 1900, or in the future is refused.
export function parsePostedAt(value: unknown, now = new Date()): Date | undefined {
  if (value === undefined) return undefined;
  const date = inRange(value, now);
  if (!date) throw new RequestError(400, BAD);
  return date;
}

// An ISO string between 1900 and now as a date, else null.
function inRange(value: unknown, now: Date): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) || time < EARLIEST || time > now.getTime() ? null : new Date(time);
}

// The taken dates sent for the photos being added (`ids`), by public ID. Anything else is
// ignored: other keys, a value that isn't a date in range, a map that isn't an object. A wrong
// camera clock so never blocks a post.
export function parsePhotoDates(value: unknown, ids: Iterable<string>, now = new Date()): Map<string, Date> {
  const found = new Map<string, Date>();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return found;
  for (const id of ids) {
    if (!Object.hasOwn(value, id)) continue;
    const date = inRange((value as Record<string, unknown>)[id], now);
    if (date) found.set(id, date);
  }
  return found;
}
