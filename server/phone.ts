import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";

// A phone number as typed, after trimming: digits, spaces, and + - ( ) . only, with 7 to 15
// digits, so any country's numbers fit. An empty box means "no number" and gives null.
export function validPhone(phone: unknown): string | null {
  if (typeof phone !== "string") throw invalidPhone();
  const clean = phone.trim();
  if (clean === "") return null;
  const digits = clean.replace(/\D/g, "").length;
  if (clean.length > 30 || !/^[\d\s+\-().]+$/.test(clean) || digits < 7 || digits > 15) throw invalidPhone();
  return clean;
}

function invalidPhone() {
  return new RequestError(400, "Please enter a valid phone number.");
}

// The signed-in supporter sets or clears their own phone number. The session's record may be
// stale, so the write itself checks they're still an active supporter of this family: a
// supporter promoted a moment ago must not end up with a phone number.
export async function setOwnPhone(db: Db, person: Person, phone: unknown): Promise<Person> {
  const clean = validPhone(phone);
  const { count } = await db.person.updateMany({
    where: { id: person.id, familyId: person.familyId, role: "supporter", removedAt: null },
    data: { phone: clean },
  });
  if (count === 0) throw new RequestError(403, "Only supporters can add a phone number");
  return db.person.findUniqueOrThrow({ where: { id: person.id } });
}
