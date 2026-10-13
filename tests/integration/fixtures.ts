import type { Db } from "../../server/db.js";
import type { Email, SendEmail, SendEmails } from "../../server/email.js";
import { createFamily } from "../../server/families.js";

export async function resetDb(db: Db) {
  await db.$executeRawUnsafe(
    `TRUNCATE "GateAttempt", "Update", "Session", "MagicLink", "Person", "Family" CASCADE`,
  );
}

// A family of fictional family members, named after the given surname.
export async function makeFamily(db: Db, surname: string, firstNames = ["Ana"]) {
  const family = await createFamily(db, {
    displayName: `The ${surname} Family`,
    question: "What is the dog's name?",
    acceptedAnswers: ["Biscuit"],
    members: firstNames.map((first) => ({
      name: `${first} ${surname}`,
      email: `${first}.${surname}@example.com`.toLowerCase(),
    })),
  });
  const people = await db.person.findMany({ where: { familyId: family.id }, orderBy: { name: "asc" } });
  return { family, people };
}

// A mailer that records what it was asked to send.
export function fakeMailer() {
  const sent: Email[] = [];
  const send: SendEmail = async (email) => {
    sent.push(email);
  };
  const sendMany: SendEmails = async (emails) => {
    sent.push(...emails);
  };
  return { sent, send, sendMany };
}

export function tokenFrom(email: Email): string {
  const match = email.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("No token in email");
  return match[1]!;
}
