import type { Db } from "./db.js";
import { makeSlug } from "./slug.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// A plausible address: no spaces, one @, and a domain with at least one dot, no
// empty parts, and a final part of 2+ characters. It can't prove the address is
// real; only a confirmation email can.
export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/.test(email);
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
  const invalid = input.members.find((m) => !isValidEmail(normalizeEmail(m.email)));
  if (invalid) throw new Error(`Not a valid email: ${invalid.email}`);
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
