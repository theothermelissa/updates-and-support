import { MAX_PRIVACY_NOTICE } from "../src/lib/privacyNotice.js";
import { dropsAnAnswer } from "./answers.js";
import { sharedOnlyWith } from "./audience.js";
import { newSignInLink, newVerificationLink, signInLinkUrl, WELCOME_LINK_LIFETIME } from "./auth.js";
import type { Db } from "./db.js";
import { addedEmail, appUrl, invitedEmail, welcomeEmail, type SendEmail } from "./email.js";
import { RequestError } from "./errors.js";
import { familyHomePath, validNameAndEmail } from "./families.js";
import { lockGate, QUEUE } from "./gate.js";
import type { Family, Person, Prisma } from "./generated/prisma/client.js";

const MAX_QUESTION = 500;
const MAX_ANSWER = 200;
const MAX_ANSWERS = 50;
const INVITE_REQUEST_EXPIRY = 30 * 24 * 60 * 60 * 1000;

// Requests to join made before this are expired: deleted by the next request, and never shown or approved.
export function inviteRequestCutoff(): Date {
  return new Date(Date.now() - INVITE_REQUEST_EXPIRY);
}

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

const ONLY_ADMINS = "Only admins can do this";

// Managing the family (the People page's changes, the family's settings, requests to join) is
// for admins. `person` comes from getSession, loaded fresh each request, so a demotion applies
// on the next request.
export function requireAdmin(person: Person) {
  if (person.role !== "family" || !person.isAdmin) throw new RequestError(403, ONLY_ADMINS);
}

// The People page, for family members only; supporters never see each other or any group.
// A non-admin gets a read-only list: the family's members and its active supporters with
// their contact details, and nothing else. An admin also gets the removed supporters (newest
// first), how many devices are signed in without a verified email, the community question,
// the family's note reactions, whether new updates allow notes, the family's privacy banner
// wording (null for the standard wording), its groups, and its requests to join.
export async function listPeople(db: Db, person: Person) {
  requireFamilyMember(person);
  if (!person.isAdmin) return listPeopleReadOnly(db, person);
  const family = await db.family.findUniqueOrThrow({
    where: { id: person.familyId },
    include: { people: { where: { email: { not: null } }, orderBy: { createdAt: "desc" } } },
  });
  const familyMembers = family.people
    .filter((p) => p.role === "family" && !p.removedAt)
    .reverse()
    .map((p) => ({ id: p.id, name: p.name, email: p.email, isAdmin: p.isAdmin, isYou: p.id === person.id }));
  const supporters = family.people.filter((p) => p.role === "supporter").map(supporterView);
  const devicesWithoutVerifiedEmail = await db.session.count({ where: unverifiedSessions(person.familyId) });
  // Pending requests to join, oldest first. Only an invite-only family takes them. Expired ones
  // are never shown, though they may not be deleted yet.
  const inviteRequests = family.inviteOnly
    ? await db.inviteRequest.findMany({
        where: { familyId: person.familyId, createdAt: { gt: inviteRequestCutoff() } },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, message: true, createdAt: true },
      })
    : [];
  return {
    admin: true as const,
    familyMembers,
    supporters: supporters.filter((s) => !s.removedAt),
    removed: supporters.filter((s) => s.removedAt),
    devicesWithoutVerifiedEmail,
    question: family.question,
    acceptedAnswers: family.acceptedAnswers,
    noteReactions: family.noteReactionKinds,
    allowNotesByDefault: family.allowNotesByDefault,
    privacyNotice: family.privacyNotice,
    publicUpdatesOn: family.publicUpdatesOn,
    publicNotice: family.publicNotice,
    publicUpdateCount: await db.update.count({ where: { familyId: person.familyId, audience: "public" } }),
    groups: await groupsView(db, person.familyId),
    inviteRequests,
  };
}

// A non-admin's People page. Runs no query for anything else, so nothing else can leak.
async function listPeopleReadOnly(db: Db, person: Person) {
  const people = await db.person.findMany({
    where: { familyId: person.familyId, email: { not: null }, removedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return {
    admin: false as const,
    familyMembers: people
      .filter((p) => p.role === "family")
      .reverse()
      .map((p) => ({ id: p.id, name: p.name, email: p.email, isYou: p.id === person.id })),
    supporters: people.filter((p) => p.role === "supporter").map(supporterView),
  };
}

export type GroupView = {
  id: string;
  name: string;
  members: { id: string; name: string; email: string; emailVerified: boolean; removed: boolean }[];
  // How many updates are shared with this group and no other, for the deletion's confirmation.
  onlyHere: number;
};

// The family's groups and their members, each sorted by name. Members are supporters with an
// email; a removed one stays in their groups.
async function groupsView(db: Db, familyId: string): Promise<GroupView[]> {
  const groups = await db.group.findMany({
    where: { familyId },
    include: { members: { select: { person: true } } },
  });
  return Promise.all(
    groups.map(async (group) => ({
      id: group.id,
      name: group.name,
      members: group.members
        .map(({ person: p }) => ({
          id: p.id,
          name: p.name ?? "",
          email: p.email ?? "",
          emailVerified: p.emailVerifiedAt !== null,
          removed: p.removedAt !== null,
        }))
        .sort(byName),
      onlyHere: await db.update.count({ where: sharedOnlyWith(familyId, group.id) }),
    })),
  ).then((views) => views.sort(byName));
}

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
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
// Family members keep no phone number, so a promoted supporter's is cleared. `admin` is
// required, and sets whether the new, promoted, or restored family member is an admin; a
// current family member's admin status is never touched here.
export async function addFamilyMember(
  db: Db,
  send: SendEmail,
  person: Person,
  input: { name?: unknown; email?: unknown; admin?: unknown },
): Promise<{ name: string; outcome: "added" | "promoted" | "restored" }> {
  requireAdmin(person);
  if (typeof input.admin !== "boolean") {
    throw new RequestError(400, "Choose whether they can manage people and settings.");
  }
  const admin = input.admin;
  const { name, email } = validNameAndEmail(input.name, input.email);
  const family = await db.family.findUniqueOrThrow({ where: { id: person.familyId } });
  const link = newSignInLink();

  let outcome: "added" | "promoted" | "restored";
  try {
    outcome = await db.$transaction(async (tx) => {
      // An admin demoted a moment ago can't mint one: the admin check reads the database, not `person`.
      const actor = await tx.person.findFirst({
        where: { id: person.id, role: "family", removedAt: null, isAdmin: true },
      });
      if (!actor) throw new RequestError(403, ONLY_ADMINS);
      const existing = await tx.person.findUnique({ where: { familyId_email: { familyId: family.id, email } } });
      if (existing?.role === "family" && !existing.removedAt) throw alreadyFamily();
      if (!existing) {
        await tx.person.create({
          data: { familyId: family.id, role: "family", isAdmin: admin, name, email, magicLinks: { create: link.data } },
        });
        return "added";
      }
      await tx.person.update({
        where: { id: existing.id },
        // Removing a supporter turned their notifications off; a family member gets them again.
        data: {
          role: "family",
          isAdmin: admin,
          name,
          phone: null,
          removedAt: null,
          ...(existing.removedAt ? { notificationsOn: true } : {}),
          magicLinks: { create: link.data },
        },
      });
      await tx.session.deleteMany({ where: { personId: existing.id } });
      // Family members are never in a group: they see every update.
      await tx.groupMember.deleteMany({ where: { personId: existing.id } });
      // A supporter's notes were written for their group's eyes; now they'd reach every reader
      // of the update, so they become family-only.
      if (existing.role === "supporter") {
        await tx.note.updateMany({ where: { authorId: existing.id }, data: { familyOnly: true } });
      }
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
// An invite-only family, which has no question to answer with a confirmation link, sends a
// one-use sign-in link instead; using it also confirms the email. An email already in the
// family changes nothing.
export async function addSupporter(
  db: Db,
  send: SendEmail,
  person: Person,
  input: { name?: unknown; email?: unknown },
): Promise<{ name: string }> {
  requireAdmin(person);
  const { name, email } = validNameAndEmail(input.name, input.email);
  const family = await db.family.findUniqueOrThrow({ where: { id: person.familyId } });

  const existing = await db.person.findUnique({ where: { familyId_email: { familyId: family.id, email } } });
  if (existing?.role === "family") throw new RequestError(409, "That email belongs to a family member.");
  if (existing?.removedAt) {
    throw new RequestError(409, "That supporter was removed. You can restore them from the removed list.");
  }
  if (existing) throw new RequestError(409, "That person is already a supporter.");

  let link;
  try {
    link = await createSupporter(db, family, name, email);
  } catch (err) {
    // Someone with this email was added or joined a moment ago.
    if ((err as { code?: string }).code === "P2002") {
      throw new RequestError(409, "That email is already in this family.");
    }
    throw err;
  }
  await sendSupporterWelcome(send, family, email, link.token);
  return { name };
}

// Creates a supporter and the link their welcome email carries: a one-use sign-in link for an
// invite-only family, otherwise a confirmation link. Throws Prisma's P2002 when the email is
// already in the family. Takes a transaction so the invite request's approval can use it.
export async function createSupporter(
  db: Prisma.TransactionClient,
  family: Family,
  name: string,
  email: string,
) {
  const link = family.inviteOnly ? newSignInLink(WELCOME_LINK_LIFETIME) : newVerificationLink();
  await db.person.create({
    data: { familyId: family.id, role: "supporter", name, email, magicLinks: { create: link.data } },
  });
  return link;
}

// They're added either way; if the email fails, they can sign in by email from the gate.
export async function sendSupporterWelcome(send: SendEmail, family: Family, email: string, token: string) {
  try {
    await send(
      family.inviteOnly
        ? invitedEmail(email, family.displayName, {
            signIn: signInLinkUrl(family.slug, token),
            site: `${appUrl()}${familyHomePath(family.slug)}`,
          })
        : welcomeEmail(email, family.displayName, `${appUrl()}/f/${family.slug}/verify#token=${token}`),
    );
  } catch (err) {
    console.error(`Welcome email failed at ${family.slug}:`, err);
  }
}

// Removes or restores a supporter, or removes a family member, in the signed-in family
// member's own family. Another family's people behave like IDs that don't exist.
export async function setRemoved(db: Db, person: Person, id: string, removed: unknown): Promise<void> {
  requireAdmin(person);
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

// A family always keeps at least one admin. Removals and admin changes in one family take
// turns on the family's row, and each re-checks that the actor is still an active admin:
// since no one can remove themselves, the remover always remains. That also stops a request
// from someone removed or demoted a moment ago.
async function removeFamilyMember(db: Db, person: Person, id: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Family" WHERE id = ${person.familyId} FOR UPDATE`;
    const remover = await tx.person.findFirst({
      where: { id: person.id, role: "family", removedAt: null, isAdmin: true },
    });
    if (!remover) throw new RequestError(403, ONLY_ADMINS);
    const { count } = await tx.person.updateMany({
      where: { id, familyId: person.familyId, role: "family", removedAt: null },
      data: { removedAt: new Date() },
    });
    if (count === 0) throw new RequestError(404, "Person not found");
    await endAccess(tx, id);
  });
}

// An admin makes a family member an admin or not, themselves included. Takes turns with
// removals on the family's row, re-checks that the actor is still an active admin, and
// refuses (undoing the change) if no active admin would remain.
export async function setAdmin(db: Db, person: Person, id: string, admin: unknown): Promise<void> {
  requireAdmin(person);
  if (typeof admin !== "boolean") throw new RequestError(400, "Expected admin: true or false");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Family" WHERE id = ${person.familyId} FOR UPDATE`;
    const actor = await tx.person.findFirst({
      where: { id: person.id, role: "family", removedAt: null, isAdmin: true },
    });
    if (!actor) throw new RequestError(403, ONLY_ADMINS);
    const { count } = await tx.person.updateMany({
      where: { id, familyId: person.familyId, role: "family", removedAt: null },
      data: { isAdmin: admin },
    });
    if (count === 0) throw new RequestError(404, "Person not found");
    const admins = await tx.person.count({
      where: { familyId: person.familyId, role: "family", removedAt: null, isAdmin: true },
    });
    if (admins === 0) throw new RequestError(409, "A family needs at least one admin.");
  });
}

// Marks an active supporter's email verified on a family member's word, for supporters who
// never manage the emailed confirmation. Their sessions and any confirmation link stay as they are.
// The update's filter is the whole rule; the lookup after it only tells a repeat from a refusal.
export async function verifySupporter(db: Db, person: Person, id: string, verified: unknown): Promise<void> {
  requireAdmin(person);
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

// A banner's wording as typed: kept on one line, up to the limit; empty means the standard wording (null).
export function parseBanner(value: unknown, field: string): string | null {
  if (typeof value !== "string") throw new RequestError(400, `Expected ${field} as text.`);
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length > MAX_PRIVACY_NOTICE) {
    throw new RequestError(400, `The banner can be up to ${MAX_PRIVACY_NOTICE} characters.`);
  }
  return text || null;
}

// An admin rewords the privacy banner for everyone signed in to the family. It's kept on
// one line; an empty wording returns the family to the standard one.
export async function setPrivacyNotice(
  db: Db,
  person: Person,
  input: { privacyNotice?: unknown },
): Promise<{ privacyNotice: string | null }> {
  requireAdmin(person);
  const text = parseBanner(input.privacyNotice, "privacyNotice");
  return db.family.update({
    where: { id: person.familyId },
    data: { privacyNotice: text },
    select: { privacyNotice: true },
  });
}

// Changes the question and accepted answers. When an answer that worked stops working, every
// supporter without a verified email is signed out, so whoever got in with the old answer
// must answer again; supporters with a verified email can be seen and removed one by one.
// Holds the gate lock, so no answer is checked against the old answers once this commits.
// An invite-only family never gets a question or answers.
export async function changeQuestion(
  db: Db,
  person: Person,
  input: { question?: unknown; answers?: unknown },
): Promise<{ question: string; acceptedAnswers: string[]; signedOut: number }> {
  requireAdmin(person);
  const { inviteOnly } = await db.family.findUniqueOrThrow({ where: { id: person.familyId } });
  if (inviteOnly) throw new RequestError(403, "This family is invite-only.");
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
