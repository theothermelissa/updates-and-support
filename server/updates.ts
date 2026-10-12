import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";

const MAX_BODY = 20_000;

export type UpdateView = {
  id: string;
  body: string;
  authorName: string;
  createdAt: Date;
  editedAt: Date | null;
};

// Everyone signed in to the family reads every update, newest first.
export async function listUpdates(db: Db, person: Person): Promise<UpdateView[]> {
  const updates = await db.update.findMany({
    where: { familyId: person.familyId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });
  return updates.map(view);
}

export async function createUpdate(db: Db, person: Person, body: unknown): Promise<UpdateView> {
  requireFamilyMember(person);
  const update = await db.update.create({
    data: { familyId: person.familyId, authorId: person.id, body: validBody(body) },
    include: { author: { select: { name: true } } },
  });
  return view(update);
}

// Any family member may edit any update in their own family.
export async function editUpdate(db: Db, person: Person, id: string, body: unknown): Promise<UpdateView> {
  requireFamilyMember(person);
  const text = validBody(body);
  // Scoped by family: another family's update ID behaves like one that doesn't exist.
  const { count } = await db.update.updateMany({
    where: { id, familyId: person.familyId },
    data: { body: text, editedAt: new Date() },
  });
  if (count === 0) throw new RequestError(404, "Update not found");
  const update = await db.update.findUniqueOrThrow({
    where: { id },
    include: { author: { select: { name: true } } },
  });
  return view(update);
}

// Deletion is permanent: the row is removed, not hidden.
export async function deleteUpdate(db: Db, person: Person, id: string): Promise<void> {
  requireFamilyMember(person);
  const { count } = await db.update.deleteMany({ where: { id, familyId: person.familyId } });
  if (count === 0) throw new RequestError(404, "Update not found");
}

function requireFamilyMember(person: Person) {
  if (person.role !== "family") throw new RequestError(403, "Only family members can change updates");
}

function validBody(body: unknown): string {
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length === 0 || text.length > MAX_BODY) {
    throw new RequestError(400, `An update must be 1 to ${MAX_BODY.toLocaleString("en-US")} characters`);
  }
  return text;
}

function view(update: {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { name: string };
}): UpdateView {
  return {
    id: update.id,
    body: update.body,
    authorName: update.author.name,
    createdAt: update.createdAt,
    editedAt: update.editedAt,
  };
}
