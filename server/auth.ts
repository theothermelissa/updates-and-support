import type { Db } from "./db.js";
import { appUrl, signInEmail, type SendEmail } from "./email.js";
import { normalizeEmail } from "./families.js";
import type { LinkPurpose, Person, Prisma } from "./generated/prisma/client.js";
import { hashToken, newToken } from "./tokens.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const LINK_LIFETIME = 15 * MINUTE;
const LINKS_PER_HOUR = 5;
export const VERIFY_LINK_LIFETIME = 7 * DAY;
export const SESSION_LIFETIME = { family: 30 * DAY, supporter: 180 * DAY } as const;

// Sends a magic link if the email belongs to someone in the family who hasn't been
// removed, within the rate limit. Returns nothing either way, so callers can't learn who is a member.
export async function requestSignInLink(
  db: Db,
  send: SendEmail,
  slug: string,
  email: string,
): Promise<void> {
  const person = await db.person.findFirst({
    where: { email: normalizeEmail(email), family: { slug }, removedAt: null },
    include: { family: true },
  });
  if (!person) return;

  const recent = await db.magicLink.count({
    where: { personId: person.id, createdAt: { gt: new Date(Date.now() - 60 * MINUTE) } },
  });
  if (recent >= LINKS_PER_HOUR) return;

  const token = newToken();
  await db.magicLink.create({
    data: {
      personId: person.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + LINK_LIFETIME),
    },
  });
  // After "#", which browsers never send to a server: the token stays out of request
  // logs and survives redirects, such as Vercel's login check on previews.
  const link = `${appUrl()}/f/${slug}/sign-in#token=${token}`;
  await send(signInEmail(person.email, person.family.displayName, link));
}

// Spends an unused, unexpired sign-in link for this family, starts a session, and
// marks the email verified. Returns the new session's token and person, or null.
export async function signInWithLink(
  db: Db,
  slug: string,
  token: string,
): Promise<{ sessionToken: string; person: Person } | null> {
  return db.$transaction(async (tx) => {
    const person = await spendLink(tx, slug, token, "sign_in");
    if (!person) return null;

    const sessionToken = newToken();
    await tx.session.create({
      data: {
        personId: person.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(Date.now() + SESSION_LIFETIME[person.role]),
      },
    });
    return { sessionToken, person: await markVerified(tx, person) };
  });
}

// Spends an unused, unexpired verification link for this family and marks the
// email verified. Never starts a session. Returns whether it worked.
export async function verifyEmail(db: Db, slug: string, token: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const person = await spendLink(tx, slug, token, "verify");
    if (!person) return false;
    await markVerified(tx, person);
    return true;
  });
}

// A new verification link's data, for creating alongside the person it belongs to.
export function newVerificationLink() {
  const token = newToken();
  return {
    token,
    data: {
      purpose: "verify" as const,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_LINK_LIFETIME),
    },
  };
}

// Marks a link used and returns its person, or null after logging why it was refused.
// Every check comes before the link is spent, so a link pressed on the wrong page, or
// at another family's address, still works where it belongs.
async function spendLink(
  tx: Prisma.TransactionClient,
  slug: string,
  token: string,
  purpose: LinkPurpose,
): Promise<Person | null> {
  const link = await tx.magicLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: { include: { family: true } } },
  });
  // Logs the reason, never the token itself, so stuck links can be diagnosed.
  const refusal = !link
    ? `no link matches the token (${token.length} characters received)`
    : link.purpose !== purpose
      ? `link is a ${link.purpose} link`
      : link.usedAt
        ? "link already used"
        : link.expiresAt <= new Date()
          ? "link expired"
          : link.person.family.slug !== slug
            ? "link is for another family"
            : link.person.removedAt
              ? "person removed"
              : null;
  if (refusal || !link) {
    console.warn(`${purpose} link refused at ${slug}: ${refusal}`);
    return null;
  }

  // Conditional update: if two requests race, only one marks the link used.
  const spent = await tx.magicLink.updateMany({
    where: { id: link.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (spent.count !== 1) return null;
  const { family: _family, ...person } = link.person;
  return person;
}

async function markVerified(tx: Prisma.TransactionClient, person: Person): Promise<Person> {
  if (person.emailVerifiedAt) return person;
  return tx.person.update({ where: { id: person.id }, data: { emailVerifiedAt: new Date() } });
}

// The person signed in with this session token in this family, or null. A removed
// person's sessions are deleted on removal; checking here too covers any that slip past.
export async function getSession(db: Db, slug: string, token: string): Promise<Person | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: { include: { family: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  if (session.person.family.slug !== slug || session.person.removedAt) return null;
  const { family: _family, ...person } = session.person;
  return person;
}

export async function signOut(db: Db, token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
