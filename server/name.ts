import type { Db } from "./db.js";
import { validName } from "./families.js";
import type { Person } from "./generated/prisma/client.js";

// The signed-in person changing their own name. Notes, reactions, and updates show the
// name on the record, so this re-signs everything they've already left.
export async function setOwnName(db: Db, person: Person, name: unknown): Promise<Person> {
  return db.person.update({ where: { id: person.id }, data: { name: validName(name) } });
}
