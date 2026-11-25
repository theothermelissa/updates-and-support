import type { Db } from "./db.js";
import type { Person } from "./generated/prisma/client.js";

export type ReaderScope = {
  isFamily: boolean;
  // Everyone whose notes this reader sees, and whom they see named on reactions: the reader
  // themself, the family's members, and the supporters who share a group with them (or, for a
  // reader in no group, who are also in none). One set, so the notes rule and the names rule
  // can't drift apart. Empty and unused for a family member, who sees everyone.
  seenIds: Set<string>;
};

// The scope for someone who has just written a note: a new note has no reactions to name.
export function authorScope(person: Person): ReaderScope {
  return { isFamily: person.role === "family", seenIds: new Set([person.id]) };
}

// Decided on every request from current membership, read from the database and never from the
// session's copy. A supporter's groups count only while their email is verified and they aren't
// removed (the rule visibleUpdates uses for group updates); anyone else is in no group.
export async function readerScope(db: Pick<Db, "person">, person: Person): Promise<ReaderScope> {
  if (person.role === "family") return { isFamily: true, seenIds: new Set() };
  const people = await db.person.findMany({
    where: { familyId: person.familyId, removedAt: null },
    select: {
      id: true,
      role: true,
      emailVerifiedAt: true,
      groupMemberships: { where: { group: { familyId: person.familyId } }, select: { groupId: true } },
    },
  });
  const groupsOf = (p: (typeof people)[number]) =>
    p.emailVerifiedAt ? new Set(p.groupMemberships.map((m) => m.groupId)) : new Set<string>();
  const self = people.find((p) => p.id === person.id);
  const mine = self ? groupsOf(self) : new Set<string>();
  const seenIds = new Set([person.id]);
  for (const p of people) {
    if (p.role === "family") seenIds.add(p.id);
    else {
      const theirs = groupsOf(p);
      const shares = mine.size === 0 ? theirs.size === 0 : [...theirs].some((g) => mine.has(g));
      if (shares) seenIds.add(p.id);
    }
  }
  return { isFamily: false, seenIds };
}
