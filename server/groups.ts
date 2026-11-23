import { GROUP_GONE, lockGroups, sharedOnlyWith } from "./audience.js";
import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import type { Person, Prisma } from "./generated/prisma/client.js";
import { requireFamilyMember } from "./people.js";

// A family's groups, managed by its family members on the People page. Every write here takes
// the family's groups lock first (see lockGroups), so it takes turns with every other group
// write and every audience write, and none of them can act on a group that's changing under it.

const MAX_NAME = 50;
const MAX_GROUPS = 50;

export async function createGroup(db: Db, person: Person, input: { name?: unknown }): Promise<{ id: string; name: string }> {
  requireFamilyMember(person);
  const name = validName(input.name);
  return db.$transaction(async (tx) => {
    await lockGroups(tx, person.familyId);
    if ((await tx.group.count({ where: { familyId: person.familyId } })) >= MAX_GROUPS) {
      throw new RequestError(409, `A family can have at most ${MAX_GROUPS} groups.`);
    }
    await refuseTakenName(tx, person.familyId, name);
    return tx.group.create({ data: { familyId: person.familyId, name }, select: { id: true, name: true } });
  });
}

export async function renameGroup(db: Db, person: Person, id: string, name: unknown): Promise<{ id: string; name: string }> {
  requireFamilyMember(person);
  const newName = validName(name);
  return db.$transaction(async (tx) => {
    await lockGroups(tx, person.familyId);
    await findGroup(tx, person.familyId, id);
    await refuseTakenName(tx, person.familyId, newName, id);
    return tx.group.update({ where: { id }, data: { name: newName }, select: { id: true, name: true } });
  });
}

// Only a supporter in the supporter list can be added: one with an email, verified or not, who
// isn't removed. Their row is locked, so a promotion at the same moment takes turns with this.
// Adding someone already in the group changes nothing.
export async function addGroupMember(db: Db, person: Person, id: string, personId: unknown): Promise<void> {
  requireFamilyMember(person);
  if (typeof personId !== "string") throw new RequestError(400, "Expected a person's id");
  await db.$transaction(async (tx) => {
    await lockGroups(tx, person.familyId);
    await findGroup(tx, person.familyId, id);
    const [supporter] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Person"
      WHERE id = ${personId} AND "familyId" = ${person.familyId} AND role = 'supporter'
        AND email IS NOT NULL AND "removedAt" IS NULL
      FOR UPDATE`;
    if (!supporter) throw new RequestError(404, "Person not found");
    await tx.groupMember.createMany({ data: [{ groupId: id, personId }], skipDuplicates: true });
  });
}

// Takes effect on the member's next request. Removing someone who isn't in the group changes nothing.
export async function removeGroupMember(db: Db, person: Person, id: string, personId: unknown): Promise<void> {
  requireFamilyMember(person);
  if (typeof personId !== "string") throw new RequestError(400, "Expected a person's id");
  await db.$transaction(async (tx) => {
    await lockGroups(tx, person.familyId);
    await findGroup(tx, person.familyId, id);
    await tx.groupMember.deleteMany({ where: { groupId: id, personId } });
  });
}

// Deletes a group and gives the updates shared only with it the groups in moveTo, or family
// members only when it's empty or absent. Never widens any other update: one shared with other
// groups too just loses this one, by the cascade. Applies to the updates shared only with it
// when the deletion happens, which the groups lock holds still.
export async function deleteGroup(db: Db, person: Person, id: string, moveTo: unknown): Promise<void> {
  requireFamilyMember(person);
  const targets = parseMoveTo(moveTo);
  await db.$transaction(async (tx) => {
    await lockGroups(tx, person.familyId);
    await findGroup(tx, person.familyId, id);
    if (targets.includes(id)) throw new RequestError(400, "Choose groups other than the one being deleted");
    if (targets.length > 0) {
      const found = await tx.group.count({ where: { id: { in: targets }, familyId: person.familyId } });
      if (found !== targets.length) throw new RequestError(409, GROUP_GONE);
      const only = await tx.update.findMany({ where: sharedOnlyWith(person.familyId, id), select: { id: true } });
      // An update deleted meanwhile drops out here rather than failing the insert below.
      const kept = only.length === 0 ? [] : await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Update" WHERE id = ANY(${only.map((u) => u.id)}) FOR UPDATE`;
      const rows = kept.flatMap((u) => targets.map((groupId) => ({ updateId: u.id, groupId })));
      if (rows.length > 0) await tx.updateGroup.createMany({ data: rows });
    }
    await tx.group.delete({ where: { id } });
  });
}

// Another family's group behaves like one that doesn't exist.
async function findGroup(tx: Prisma.TransactionClient, familyId: string, id: string) {
  const group = await tx.group.findFirst({ where: { id, familyId } });
  if (!group) throw new RequestError(404, "Group not found");
  return group;
}

function validName(input: unknown): string {
  const name = typeof input === "string" ? input.trim() : "";
  if (name.length === 0 || name.length > MAX_NAME) {
    throw new RequestError(400, `A group's name must be 1 to ${MAX_NAME} characters.`);
  }
  return name;
}

// No two groups in a family share a name, ignoring capitals. A group may change its own capitals.
async function refuseTakenName(tx: Prisma.TransactionClient, familyId: string, name: string, exceptId?: string) {
  const taken = await tx.group.findFirst({
    where: { familyId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (taken) throw new RequestError(409, `There's already a group called ${taken.name}.`);
}

function parseMoveTo(input: unknown): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || !input.every((id) => typeof id === "string")) {
    throw new RequestError(400, "Expected moveTo as a list of groups");
  }
  if (new Set(input).size !== input.length) throw new RequestError(400, "A group is listed twice");
  return input as string[];
}
