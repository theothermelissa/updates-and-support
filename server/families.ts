import type { Db } from "./db.js";
import { RequestError } from "./errors.js";
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

// A person's name and email from a form, cleaned up, or a 400 saying what's wrong.
export function validNameAndEmail(name: unknown, email: unknown) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? normalizeEmail(email) : "";
  if (cleanName.length < 1 || cleanName.length > 100) {
    throw new RequestError(400, "Please enter a name (up to 100 characters).");
  }
  if (!isValidEmail(cleanEmail)) {
    throw new RequestError(400, "Please enter a valid email address.");
  }
  return { name: cleanName, email: cleanEmail };
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

// The family at this address, following a redirect from an old address (see familyRedirects).
export function findFamilyBySlug(db: Db, slug: string) {
  return db.family.findUnique({ where: { slug: familyRedirects().get(slug) ?? slug } });
}

// Old addresses that lead to a family's current one, from FAMILY_REDIRECTS ("old=new,…"). A
// deployment setting rather than code, so real family addresses stay out of the repository.
// Malformed pairs are ignored.
export function familyRedirects(setting = process.env.FAMILY_REDIRECTS ?? ""): Map<string, string> {
  const redirects = new Map<string, string>();
  for (const pair of setting.split(",")) {
    const [from = "", to = "", ...rest] = pair.split("=").map((part) => part.trim().toLowerCase());
    if (rest.length === 0 && isValidSlug(from) && isValidSlug(to) && from !== to) redirects.set(from, to);
  }
  return redirects;
}

// The address of the family shown at the site's root, from ROOT_FAMILY_SLUG, or null.
export function rootFamilySlug(setting = process.env.ROOT_FAMILY_SLUG ?? ""): string | null {
  const slug = setting.trim().toLowerCase();
  return isValidSlug(slug) ? slug : null;
}

// A family's address: words of lowercase letters and numbers joined by single hyphens, such
// as "for-sam" or "rivera-k3f9m2xq".
export function isValidSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

// Gives the family at currentSlug a new display name and address. The old address stops
// working at once, and because session cookies are named for the address, everyone signs in
// again at the new one. Refuses an address another family has, changing nothing.
export async function renameFamily(db: Db, currentSlug: string, input: { displayName: string; slug: string }) {
  const displayName = input.displayName.trim();
  const slug = input.slug.trim().toLowerCase();
  if (displayName.length < 1 || displayName.length > 100) {
    throw new Error("A display name must be 1 to 100 characters.");
  }
  if (!isValidSlug(slug)) {
    throw new Error(`Not a valid address: "${slug}". Use lowercase letters and numbers joined by single hyphens.`);
  }
  try {
    return await db.family.update({ where: { slug: currentSlug }, data: { displayName, slug } });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") throw new Error(`No family at /f/${currentSlug}.`);
    if (code === "P2002") throw new Error("That address belongs to another family.");
    throw err;
  }
}
