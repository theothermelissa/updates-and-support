import { RequestError } from "./errors.js";

const EARLIEST = Date.parse("1900-01-01T00:00:00Z");
const BAD = "Choose a date between 1900 and now.";

// The date a family member chose for an update, as an ISO string. Absent means "leave it".
// Anything unparseable, before 1900, or in the future is refused.
export function parsePostedAt(value: unknown, now = new Date()): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new RequestError(400, BAD);
  const time = Date.parse(value);
  if (Number.isNaN(time) || time < EARLIEST || time > now.getTime()) throw new RequestError(400, BAD);
  return new Date(time);
}
