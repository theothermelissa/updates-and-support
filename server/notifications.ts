import { newVerificationLink } from "./auth.js";
import type { Db } from "./db.js";
import { appUrl, notificationEmail, verificationEmail, type SendEmails } from "./email.js";
import { RequestError } from "./errors.js";
import type { Person } from "./generated/prisma/client.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Emails every verified, opted-in supporter of the family that there's a new update.
// Family members and unverified or opted-out supporters get nothing.
export async function notifySupporters(db: Db, send: SendEmails, familyId: string): Promise<void> {
  const family = await db.family.findUniqueOrThrow({
    where: { id: familyId },
    include: {
      people: {
        where: { role: "supporter", emailVerifiedAt: { not: null }, notificationsOn: true },
        select: { email: true, unsubscribeToken: true },
      },
    },
  });
  const base = `${appUrl()}/f/${family.slug}`;
  await send(
    family.people.map((supporter) =>
      notificationEmail(supporter.email, family.displayName, {
        site: base,
        unsubscribePage: `${base}/unsubscribe#token=${supporter.unsubscribeToken}`,
        oneClickUnsubscribe: `${appUrl()}/api/f/${family.slug}/unsubscribe?token=${supporter.unsubscribeToken}`,
      }),
    ),
  );
}

// Turns off notifications for the supporter with this token, only at their own
// family's address. Returns nothing either way, so tokens can't be probed.
export async function unsubscribe(db: Db, slug: string, token: string): Promise<void> {
  // Postgres raises an error comparing a non-UUID to a UUID column, so turn those away first.
  if (!UUID.test(token)) return;
  await db.person.updateMany({
    where: { unsubscribeToken: token, role: "supporter", family: { slug } },
    data: { notificationsOn: false },
  });
}

// A signed-in supporter turning their own notifications on or off.
export async function setNotifications(db: Db, person: Person, on: unknown): Promise<Person> {
  if (person.role !== "supporter") throw new RequestError(403, "Only supporters get notification emails");
  if (typeof on !== "boolean") throw new RequestError(400, "Expected on: true or false");
  return db.person.update({ where: { id: person.id }, data: { notificationsOn: on } });
}

// Supporters who haven't verified their email, for the one-time verification send.
export function unverifiedSupporters(db: Db) {
  return db.person.findMany({
    where: { role: "supporter", emailVerifiedAt: null },
    include: { family: true },
  });
}

// Creates a verification link for each person and emails it, with links on siteUrl.
export async function sendVerifications(
  db: Db,
  send: SendEmails,
  people: Awaited<ReturnType<typeof unverifiedSupporters>>,
  siteUrl: string,
): Promise<void> {
  const emails = [];
  for (const person of people) {
    const link = newVerificationLink();
    await db.magicLink.create({ data: { personId: person.id, ...link.data } });
    const url = `${siteUrl}/f/${person.family.slug}/verify#token=${link.token}`;
    emails.push(verificationEmail(person.email, person.family.displayName, url));
  }
  await send(emails);
}
