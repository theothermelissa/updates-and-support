import { isCorrectAnswer } from "./answers.js";
import {
  findUsableLink,
  markVerified,
  newVerificationLink,
  requestSignInLink,
  SESSION_LIFETIME,
  spendLink,
} from "./auth.js";
import type { Db } from "./db.js";
import { appUrl, verificationEmail, type SendEmail } from "./email.js";
import { RequestError } from "./errors.js";
import { validNameAndEmail } from "./families.js";
import type { Family, Person, Prisma } from "./generated/prisma/client.js";
import { hashToken, newToken } from "./tokens.js";

const HOUR = 60 * 60 * 1000;
export const BROWSER_LIMIT = 5;
export const NETWORK_LIMIT = 30;
// Transaction options for anything that takes the gate lock: under a burst, requests for
// one family queue on it.
export const QUEUE = { maxWait: 10_000, timeout: 10_000 };

// Who is answering: a random per-browser cookie and the network they're on.
export type Client = { browserId: string; network: string };

export type GateResult =
  | { result: "wrong" | "limited" }
  | { result: "joined"; sessionToken: string; person: Person };

// All a visitor who isn't signed in may learn about a family.
export function gateInfo(family: Family) {
  return { displayName: family.displayName, question: family.question };
}

// The family's gate lock, held until the transaction ends. Answer checks take it so a burst
// of parallel guesses can't all be counted before any is recorded; changes to the accepted
// answers take it so no one gets in with an answer at the moment it stops working.
export async function lockGate(tx: Prisma.TransactionClient, familyId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${familyId}))`;
}

// Checks an answer under the wrong-answer limits and records a wrong one. Takes the gate lock
// first and reads the accepted answers under it, so they can't change before the caller's
// transaction commits.
async function checkAnswer(tx: Prisma.TransactionClient, familyId: string, client: Client, answer: string) {
  await lockGate(tx, familyId);
  const since = new Date(Date.now() - HOUR);
  const [byBrowser, byNetwork] = await Promise.all([
    tx.gateAttempt.count({ where: { familyId, browserId: client.browserId, createdAt: { gt: since } } }),
    tx.gateAttempt.count({ where: { familyId, network: client.network, createdAt: { gt: since } } }),
  ]);
  if (byBrowser >= BROWSER_LIMIT || byNetwork >= NETWORK_LIMIT) return "limited" as const;
  const { acceptedAnswers } = await tx.family.findUniqueOrThrow({
    where: { id: familyId },
    select: { acceptedAnswers: true },
  });
  if (isCorrectAnswer(answer, acceptedAnswers)) return "correct" as const;
  await tx.gateAttempt.create({ data: { familyId, ...client } });
  return "wrong" as const;
}

// A correct answer signs the visitor in at once, as a new supporter with no name or email.
// Checking and signing in share one transaction under the gate lock, so a change to the
// answers lands wholly before this (and the old answer is wrong) or after it (and its
// sign-out ends this session).
export async function answerGate(
  db: Db,
  family: Family,
  client: Client,
  input: { answer?: unknown },
): Promise<GateResult> {
  const answer = typeof input.answer === "string" ? input.answer : "";
  return db.$transaction(async (tx) => {
    const outcome = await checkAnswer(tx, family.id, client, answer);
    if (outcome !== "correct") return { result: outcome };

    const sessionToken = newToken();
    const person = await tx.person.create({
      data: {
        familyId: family.id,
        role: "supporter",
        sessions: {
          create: {
            tokenHash: hashToken(sessionToken),
            expiresAt: new Date(Date.now() + SESSION_LIFETIME.supporter),
          },
        },
      },
    });
    return { result: "joined" as const, sessionToken, person };
  }, QUEUE);
}

export type AddEmailResult = { result: "verify" | "sign-in-link" };

// A signed-in supporter without an email gives their name and email, to get notifications.
// A new email goes on their own record, unverified, with a link to confirm it. An email
// already in the family is never attached, so knowing the answer can't make anyone into
// someone else; that address gets a sign-in link instead. A removed person's email is refused.
export async function addEmail(
  db: Db,
  send: SendEmail,
  family: Family,
  person: Person,
  input: { name?: unknown; email?: unknown },
): Promise<AddEmailResult> {
  if (person.role !== "supporter" || person.email !== null) throw alreadyHasEmail();
  const { name, email } = validNameAndEmail(input.name, input.email);

  const known = await db.person.findUnique({ where: { familyId_email: { familyId: family.id, email } } });
  if (known?.removedAt) {
    throw new RequestError(403, "This email can't join this family's updates. Please contact the family.");
  }
  if (known) return sendLinkInstead(db, send, family, email);

  const verification = newVerificationLink();
  try {
    await db.person.update({
      // Only while they still have no email, so two submissions can't both set one.
      where: { id: person.id, email: null },
      // Giving an email is asking for notifications.
      data: { name, email, notificationsOn: true, magicLinks: { create: verification.data } },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    // Someone in the family took this email a moment ago; treat it as a known email.
    if (code === "P2002") return sendLinkInstead(db, send, family, email);
    // This supporter's email was set a moment ago.
    if (code === "P2025") throw alreadyHasEmail();
    throw err;
  }

  // The email is added either way; a failed email only delays verification, which signing
  // in by email also does.
  const link = `${appUrl()}/f/${family.slug}/verify#token=${verification.token}`;
  try {
    await send(verificationEmail(email, family.displayName, link));
  } catch (err) {
    console.error(`Verification email failed at ${family.slug}:`, err);
  }
  return { result: "verify" };
}

function alreadyHasEmail() {
  return new RequestError(409, "You've already given an email.");
}

async function sendLinkInstead(db: Db, send: SendEmail, family: Family, email: string): Promise<AddEmailResult> {
  await requestSignInLink(db, send, family.slug, email);
  return { result: "sign-in-link" };
}

export type VerifySignInResult = { result: "invalid" | "wrong" | "limited" } | { result: "signed-in"; sessionToken: string };

// Signs a supporter in with their verification link and the community question's answer,
// under the gate's wrong-answer limits. The link alone never signs in, because these emails
// get forwarded. A bad link is refused before the answer is checked, so it costs no attempt.
// Only an active supporter can sign in this way, never a family member.
export async function signInWithVerifyLink(
  db: Db,
  family: Family,
  client: Client,
  token: string,
  answer: string,
): Promise<VerifySignInResult> {
  const found = await findUsableLink(db, family.slug, token, "verify");
  if (!found || found.person.role !== "supporter") return { result: "invalid" };

  const outcome = await db.$transaction((tx) => checkAnswer(tx, family.id, client, answer), QUEUE);
  if (outcome !== "correct") return { result: outcome };

  return db.$transaction(async (tx) => {
    // Promotion and removal update this row, so they wait for this transaction, and their
    // session cleanup then sees the session created here. Without the lock, a promotion
    // could land between this check and the insert, leaving a family-member session.
    const [locked] = await tx.$queryRaw<{ role: string; removedAt: Date | null }[]>`
      SELECT role, "removedAt" FROM "Person" WHERE id = ${found.person.id} FOR UPDATE`;
    if (locked?.role !== "supporter" || locked.removedAt) return { result: "invalid" as const };
    const person = await spendLink(tx, family.slug, token, "verify");
    if (!person) return { result: "invalid" as const };

    const sessionToken = newToken();
    await tx.session.create({
      data: {
        personId: person.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(Date.now() + SESSION_LIFETIME.supporter),
      },
    });
    await markVerified(tx, person);
    return { result: "signed-in" as const, sessionToken };
  });
}
