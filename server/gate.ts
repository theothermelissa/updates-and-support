import { isCorrectAnswer } from "./answers.js";
import { requestSignInLink, SESSION_LIFETIME } from "./auth.js";
import type { Db } from "./db.js";
import type { SendEmail } from "./email.js";
import { RequestError } from "./errors.js";
import { normalizeEmail } from "./families.js";
import type { Family, Person } from "./generated/prisma/client.js";
import { hashToken, newToken } from "./tokens.js";

const HOUR = 60 * 60 * 1000;
export const BROWSER_LIMIT = 5;
export const NETWORK_LIMIT = 30;

// Who is answering: a random per-browser cookie and the network they're on.
export type Client = { browserId: string; network: string };

export type GateResult =
  | { result: "correct" | "wrong" | "limited" | "check-email" }
  | { result: "joined"; sessionToken: string; person: Person };

// All a visitor who isn't signed in may learn about a family.
export function gateInfo(family: Family) {
  return { displayName: family.displayName, question: family.question };
}

// Checks an answer under the wrong-answer limits. With a name and email too, a
// correct answer joins the family. Joining re-checks the answer, so calling this
// directly can't skip the question.
export async function answerGate(
  db: Db,
  send: SendEmail,
  family: Family,
  client: Client,
  input: { answer?: unknown; name?: unknown; email?: unknown },
): Promise<GateResult> {
  const joining = input.name !== undefined || input.email !== undefined;
  const joiner = joining ? validJoiner(input.name, input.email) : null;
  const answer = typeof input.answer === "string" ? input.answer : "";

  const outcome = await checkAnswer(db, family, client, answer);
  if (outcome !== "correct" || !joiner) return { result: outcome };
  return join(db, send, family, joiner);
}

// Counts, checks, and records under a per-family lock, so a burst of parallel
// guesses can't all be counted before any is recorded.
function checkAnswer(db: Db, family: Family, client: Client, answer: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${family.id}))`;
      const since = new Date(Date.now() - HOUR);
      const [byBrowser, byNetwork] = await Promise.all([
        tx.gateAttempt.count({
          where: { familyId: family.id, browserId: client.browserId, createdAt: { gt: since } },
        }),
        tx.gateAttempt.count({
          where: { familyId: family.id, network: client.network, createdAt: { gt: since } },
        }),
      ]);
      if (byBrowser >= BROWSER_LIMIT || byNetwork >= NETWORK_LIMIT) return "limited" as const;
      if (isCorrectAnswer(answer, family.acceptedAnswers)) return "correct" as const;
      await tx.gateAttempt.create({ data: { familyId: family.id, ...client } });
      return "wrong" as const;
    },
    // Under a burst, requests for one family queue on the lock.
    { maxWait: 10_000, timeout: 10_000 },
  );
}

async function join(
  db: Db,
  send: SendEmail,
  family: Family,
  joiner: { name: string; email: string },
): Promise<GateResult> {
  const known = await db.person.findUnique({
    where: { familyId_email: { familyId: family.id, email: joiner.email } },
  });
  if (known) return sendLinkInstead(db, send, family, joiner.email);

  const sessionToken = newToken();
  try {
    const person = await db.person.create({
      data: {
        familyId: family.id,
        role: "supporter",
        ...joiner,
        sessions: {
          create: {
            tokenHash: hashToken(sessionToken),
            expiresAt: new Date(Date.now() + SESSION_LIFETIME.supporter),
          },
        },
      },
    });
    return { result: "joined", sessionToken, person };
  } catch (err) {
    // Another join with the same email won the race; treat it as a known email.
    if ((err as { code?: string }).code === "P2002") return sendLinkInstead(db, send, family, joiner.email);
    throw err;
  }
}

// An email already in the family gets a sign-in link, never a new session.
async function sendLinkInstead(db: Db, send: SendEmail, family: Family, email: string): Promise<GateResult> {
  await requestSignInLink(db, send, family.slug, email);
  return { result: "check-email" };
}

function validJoiner(name: unknown, email: unknown) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? normalizeEmail(email) : "";
  if (cleanName.length < 1 || cleanName.length > 100) {
    throw new RequestError(400, "Please enter your name (up to 100 characters).");
  }
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(cleanEmail)) {
    throw new RequestError(400, "Please enter a valid email address.");
  }
  return { name: cleanName, email: cleanEmail };
}
