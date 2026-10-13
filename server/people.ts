import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";

const MAX_QUESTION = 500;
const MAX_ANSWER = 200;
const MAX_ANSWERS = 50;

export type SupporterView = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  notificationsOn: boolean;
  joinedAt: Date;
  removedAt: Date | null;
};

export function requireFamilyMember(person: Person) {
  if (person.role !== "family") throw new RequestError(403, "Only family members can do this");
}

// The People page: the family's supporters, active and removed, newest first, and the
// community question. Family members only; supporters never see each other.
export async function listPeople(db: Db, person: Person) {
  requireFamilyMember(person);
  const family = await db.family.findUniqueOrThrow({
    where: { id: person.familyId },
    include: { people: { where: { role: "supporter" }, orderBy: { createdAt: "desc" } } },
  });
  const supporters = family.people.map(supporterView);
  return {
    supporters: supporters.filter((s) => !s.removedAt),
    removed: supporters.filter((s) => s.removedAt),
    question: family.question,
    acceptedAnswers: family.acceptedAnswers,
  };
}

// Removes or restores a supporter in the signed-in family member's own family. Removal
// ends their sessions, cancels their unused links, and turns notifications off. Restoring
// only clears the mark, so notifications stay off until the supporter turns them on.
export async function setRemoved(db: Db, person: Person, id: string, removed: unknown): Promise<SupporterView> {
  requireFamilyMember(person);
  if (typeof removed !== "boolean") throw new RequestError(400, "Expected removed: true or false");
  return db.$transaction(async (tx) => {
    // Scoped by family and role: another family's supporter, or a family member, behaves
    // like an ID that doesn't exist.
    const { count } = await tx.person.updateMany({
      where: { id, familyId: person.familyId, role: "supporter" },
      data: removed ? { removedAt: new Date(), notificationsOn: false } : { removedAt: null },
    });
    if (count === 0) throw new RequestError(404, "Supporter not found");
    if (removed) {
      await tx.session.deleteMany({ where: { personId: id } });
      await tx.magicLink.deleteMany({ where: { personId: id, usedAt: null } });
    }
    return supporterView(await tx.person.findUniqueOrThrow({ where: { id } }));
  });
}

// Changes the question and accepted answers. Affects only people joining afterwards.
export async function changeQuestion(
  db: Db,
  person: Person,
  input: { question?: unknown; answers?: unknown },
): Promise<{ question: string; acceptedAnswers: string[] }> {
  requireFamilyMember(person);
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (question.length === 0 || question.length > MAX_QUESTION) {
    throw new RequestError(400, `The question must be 1 to ${MAX_QUESTION} characters.`);
  }
  if (!Array.isArray(input.answers) || !input.answers.every((a) => typeof a === "string")) {
    throw new RequestError(400, "Expected answers as a list of text.");
  }
  const answers = (input.answers as string[]).map((a) => a.trim()).filter(Boolean);
  if (answers.length === 0 || answers.length > MAX_ANSWERS || answers.some((a) => a.length > MAX_ANSWER)) {
    throw new RequestError(
      400,
      `Please give 1 to ${MAX_ANSWERS} accepted answers, each up to ${MAX_ANSWER} characters.`,
    );
  }
  const family = await db.family.update({
    where: { id: person.familyId },
    data: { question, acceptedAnswers: answers },
  });
  return { question: family.question, acceptedAnswers: family.acceptedAnswers };
}

function supporterView(p: Person): SupporterView {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    emailVerified: p.emailVerifiedAt !== null,
    notificationsOn: p.notificationsOn,
    joinedAt: p.createdAt,
    removedAt: p.removedAt,
  };
}
