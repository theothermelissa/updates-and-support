import type { Db } from "./db.js";
import { makeSlug } from "./slug.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type NewFamily = {
  displayName: string;
  question: string;
  acceptedAnswers: string[];
  members: { name: string; email: string }[];
};

// Creates a family and its family members in one transaction.
export async function createFamily(db: Db, input: NewFamily) {
  if (input.members.length === 0) throw new Error("A family needs at least one family member");
  return db.family.create({
    data: {
      slug: makeSlug(input.displayName),
      displayName: input.displayName.trim(),
      question: input.question.trim(),
      acceptedAnswers: input.acceptedAnswers.map((a) => a.trim()).filter(Boolean),
      people: {
        create: input.members.map((m) => ({
          role: "family" as const,
          name: m.name.trim(),
          email: normalizeEmail(m.email),
        })),
      },
    },
  });
}

export function findFamilyBySlug(db: Db, slug: string) {
  return db.family.findUnique({ where: { slug } });
}
