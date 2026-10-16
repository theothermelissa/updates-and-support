import { dropsAnAnswer } from "./answers.js";
import { newSignInLink, newVerificationLink, signInLinkUrl } from "./auth.js";
import type { Db } from "./db.js";
import { addedEmail, appUrl, welcomeEmail, type SendEmail } from "./email.js";
import { RequestError } from "./errors.js";
import { validNameAndEmail } from "./families.js";
import { lockGate, QUEUE } from "./gate.js";
import type { Person, Prisma } from "./generated/prisma/client.js";

const MAX_QUESTION = 500;
const MAX_ANSWER = 200;
const MAX_ANSWERS = 50;

export type SupporterView = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  notificationsOn: boolean;
  joinedAt: Date;
  removedAt: Date | null;
};

export function requireFamilyMember(person: Person) {
  if (person.role !== "family") throw new RequestError(403, "Only family members can do this");
}

// The People page: the family's members, its supporters with an email (active and removed,
// newest first), how many devices are signed in without a verified email, and the community
// question. Family members only; supporters never see each other.
export async function listPeople(db: Db, person: Person) {
  requireFamilyMember(person);
  const family = await db.family.findUniqueOrThrow({
    where: { id: person.familyId },
    include: { people: { where: { email: { not: null } }, orderBy: { createdAt: "desc" } } },
  });
  const familyMembers = family.people
    .filter((p) => p.role === "family" && !p.removedAt)
    .reverse()
    .map((p) => ({ id: p.id, name: p.name, email: p.email, isYou: p.id === person.id }));
  const supporters = family.people.filter((p) => p.role === "supporter").map(supporterView);
  const devicesWithoutVerifiedEmail = await db.session.count({ where: unverifiedSessions(person.familyId) });
  return {
    familyMembers,
    supporters: supporters.filter((s) => !s.removedAt),
    removed: supporters.filter((s) => s.removedAt),
    devicesWithoutVerifiedEmail,
    question: family.question,
    acceptedAnswers: family.acceptedAnswers,
  };
}

// The live sessions of the family's supporters who have no verified email, either none given
// yet or one not yet confirmed. Changing the answers signs these out. Never family members,
// some of whom signed in before emails were verified.
function unverifiedSessions(familyId: string) {
  return {
    expiresAt: { gt: new Date() },
    person: { familyId, role: "supporter" as const, emailVerifiedAt: null },
  };
}

// Adds a family member to the signed-in family member's family and emails them a sign-in
// link. An email already in the family promotes a supporter or restores a removed person,
// keeping their record; their sessions end so they sign in again as a family member.
// Family members keep no phone number, so a promoted supporter's is cleared.
export async function addFamilyMember(
  db: Db,
  send: SendEmail,
  person: Person,
  input: { name?: unknown; email?: unknown },
): Promise<{ name: string; outcome: "added" | "promoted" | "restored" }> {
  requireFamilyMember(person);
  const { name, email } = validNameAndEmail(input.name, input.email);
  const family = await db.family.findUniqueOrThrow({ where: { id: person.familyId } });
  const link = newSignInLink();

  let outcome: "added" | "promoted" | "restored";
  try {
    outcome = await db.$transaction(async (tx) => {
      const existing = await tx.person.findUnique({ where: { familyId_email: { familyId: family.id, email } } });
      if (existing?.role === "family" && !existing.removedAt) throw alreadyFamily();
      if (!existing) {
        await tx.person.create({
          data: { familyId: family.id, role: "family", name, email, magicLinks: { create: link.data } },
        });
        return "added";
      }
      await tx.person.update({
        where: { id: existing.id },
        data: { role: "family", name, phone: null, removedAt: null, magicLinks: { create: link.data } },
      });
      await tx.session.deleteMany({ where: { personId: existing.id } });
      return existing.role === "supporter" ? "promoted" : "restored";
    });
  } catch (err) {
    // Another add of the same new email won the race. Caught outside the transaction,
    // which the unique-constraint error has already aborted.
    if ((err as { code?: string }).code === "P2002") throw alreadyFamily();
    throw err;
  }

  // They're added either way; if the email fails, they can use Family sign-in.
  try {
    await send(
      addedEmail(email, family.displayName, {
        signIn: signInLinkUrl(family.slug, link.token),
        signInPage: `${appUrl()}/f/${family.slug}/family`,
      }),
    );
  } catch (err) {
    console.error(`Added-family-member email failed at ${family.slug}:`, err);
  }
  return { name, outcome };
}

function alreadyFamily() {
  return new RequestError(409, "That person is already a family member.");
}

// Adds a supporter to the signed-in family member's family and emails them a link to confirm.
// They get no notifications until they confirm, so a mistyped email gets one email only.
// An email already in the family changes nothing.
export async function addSupporter(
  db: Db,
  send: SendEmail,
  person: Person,
  input: { name?: unknown; email?: unknown },
): Promise<{ name: string }> {
  requireFamilyMember(person);
  const { name, email } = validNameAndEmail(input.name, input.email);
  const family = await db.family.findUniqueOrThrow({ where: { id: person.familyId } });

  const existing = await db.person.findUnique({ where: { familyId_email: { familyId: family.id, email } } });
  if (existing?.role === "family") throw new RequestError(409, "That email belongs to a family member.");
  if (existing?.removedAt) {
    throw new RequestError(409, "That supporter was removed. You can restore them from the removed list.");
  }
  if (existing) throw new RequestError(409, "That person is already a supporter.");

  const verification = newVerificationLink();
  try {
    await db.person.create({
      data: { familyId: family.id, role: "supporter", name, email, magicLinks: { create: verification.data } },
    });
  } catch (err) {
    // Someone with this email was added or joined a moment ago.
    if ((err as { code?: string }).code === "P2002") {
      throw new RequestError(409, "That email is already in this family.");
    }
    throw err;
  }

  // They're added either way; if the email fails, they can sign in by email from the gate.
  try {
    await send(welcomeEmail(email, family.displayName, `${appUrl()}/f/${family.slug}/verify#token=${verification.token}`));
  } catch (err) {
    console.error(`Welcome email failed at ${family.slug}:`, err);
  }
  return { name };
}

// Removes or restores a supporter, or removes a family member, in the signed-in family
// member's own family. Another family's people behave like IDs that don't exist.
export async function setRemoved(db: Db, person: Person, id: string, removed: unknown): Promise<void> {
  requireFamilyMember(person);
  if (typeof removed !== "boolean") throw new RequestError(400, "Expected removed: true or false");
  const target = await db.person.findFirst({ where: { id, familyId: person.familyId } });
  if (!target) throw new RequestError(404, "Person not found");
  if (target.role === "supporter") return setSupporterRemoved(db, person.familyId, id, removed);
  if (!removed) throw new RequestError(400, "To restore a family member, add them again.");
  if (id === person.id) throw new RequestError(400, "You can't remove yourself.");
  return removeFamilyMember(db, person, id);
}

// Removal ends their sessions, cancels their unused links, and turns notifications off.
// Restoring only clears the mark, so notifications stay off until the supporter turns them on.
async function setSupporterRemoved(db: Db, familyId: string, id: string, removed: boolean) {
  await db.$transaction(async (tx) => {
    // The role stays in the filter: someone promoted since the lookup is no longer a supporter.
    const { count } = await tx.person.updateMany({
      where: { id, familyId, role: "supporter" },
      data: removed ? { removedAt: new Date(), notificationsOn: false } : { removedAt: null },
    });
    if (count === 0) throw new RequestError(404, "Person not found");
    if (removed) await endAccess(tx, id);
  });
}

// A family always keeps at least one family member. Removals in one family take turns on
// the family's row, and each re-checks that the remover is still an active family member:
// since no one can remove themselves, the remover always remains. That also stops a request
// from someone removed a moment ago.
async function removeFamilyMember(db: Db, person: Person, id: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Family" WHERE id = ${person.familyId} FOR UPDATE`;
    const remover = await tx.person.findFirst({ where: { id: person.id, role: "family", removedAt: null } });
    if (!remover) throw new RequestError(403, "Only family members can do this");
    const { count } = await tx.person.updateMany({
      where: { id, familyId: person.familyId, role: "family", removedAt: null },
      data: { removedAt: new Date() },
    });
    if (count === 0) throw new RequestError(404, "Person not found");
    await endAccess(tx, id);
  });
}

// Marks an active supporter's email verified on a family member's word, for supporters who
// never manage the emailed confirmation. Their sessions and any confirmation link stay as they are.
// The update's filter is the whole rule; the lookup after it only tells a repeat from a refusal.
export async function verifySupporter(db: Db, person: Person, id: string, verified: unknown): Promise<void> {
  requireFamilyMember(person);
  if (verified !== true) throw new RequestError(400, "Expected verified: true");
  const active = { id, familyId: person.familyId, role: "supporter" as const, email: { not: null }, removedAt: null };
  const { count } = await db.person.updateMany({
    where: { ...active, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  if (count === 1) return;
  const alreadyVerified = await db.person.findFirst({ where: { ...active, emailVerifiedAt: { not: null } } });
  if (!alreadyVerified) throw new RequestError(404, "Person not found");
}

async function endAccess(tx: Prisma.TransactionClient, personId: string) {
  await tx.session.deleteMany({ where: { personId } });
  await tx.magicLink.deleteMany({ where: { personId, usedAt: null } });
}

// Changes the question and accepted answers. When an answer that worked stops working, every
// supporter without a verified email is signed out, so whoever got in with the old answer
// must answer again; supporters with a verified email can be seen and removed one by one.
// Holds the gate lock, so no answer is checked against the old answers once this commits.
export async function changeQuestion(
  db: Db,
  person: Person,
  input: { question?: unknown; answers?: unknown },
): Promise<{ question: string; acceptedAnswers: string[]; signedOut: number }> {
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
  return db.$transaction(async (tx) => {
    await lockGate(tx, person.familyId);
    const before = await tx.family.findUniqueOrThrow({ where: { id: person.familyId } });
    const family = await tx.family.update({
      where: { id: person.familyId },
      data: { question, acceptedAnswers: answers },
    });
    const { count: signedOut } = dropsAnAnswer(before.acceptedAnswers, answers)
      ? await tx.session.deleteMany({ where: unverifiedSessions(person.familyId) })
      : { count: 0 };
    return { question: family.question, acceptedAnswers: family.acceptedAnswers, signedOut };
  }, QUEUE);
}

// Listed supporters always have a name and email.
function supporterView(p: Person): SupporterView {
  return {
    id: p.id,
    name: p.name ?? "",
    email: p.email ?? "",
    phone: p.phone,
    emailVerified: p.emailVerifiedAt !== null,
    notificationsOn: p.notificationsOn,
    joinedAt: p.createdAt,
    removedAt: p.removedAt,
  };
}
