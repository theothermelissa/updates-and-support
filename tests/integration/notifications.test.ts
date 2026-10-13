import { afterAll, beforeEach, expect, it } from "vitest";
import type { SendEmails } from "../../server/email.js";
import type { Person } from "../../server/generated/prisma/client.js";
import {
  sendVerifications,
  setNotifications,
  unsubscribe,
  unverifiedSupporters,
} from "../../server/notifications.js";
import { createUpdate, editUpdate } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { fakeMailer, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const SECRET = "Biopsy results came back on Tuesday";

async function supporter(familyId: string, name: string, options: { verified?: boolean; on?: boolean } = {}) {
  return db.person.create({
    data: {
      familyId,
      role: "supporter",
      name,
      email: `${name.toLowerCase()}@example.com`,
      emailVerifiedAt: options.verified === false ? null : new Date(),
      notificationsOn: options.on ?? true,
    },
  });
}

// The Rivera family with one supporter of each kind, plus an Okafor supporter. Ana, the
// family member, is verified, as family members are once they've signed in.
async function setUp() {
  const { family, people: [created] } = await makeFamily(db, "Rivera");
  const ana = await db.person.update({ where: { id: created!.id }, data: { emailVerifiedAt: new Date() } });
  const { family: okafor } = await makeFamily(db, "Okafor", ["Chidi"]);
  const people = {
    ana: ana!,
    sam: await supporter(family.id, "Sam"),
    una: await supporter(family.id, "Una", { verified: false }),
    otto: await supporter(family.id, "Otto", { on: false }),
    olu: await supporter(okafor.id, "Olu"),
  };
  return { family, okafor, ...people };
}

async function notificationsOn(person: Person) {
  return (await db.person.findUniqueOrThrow({ where: { id: person.id } })).notificationsOn;
}

it("emails only this family's verified, opted-in supporters", async () => {
  const { ana } = await setUp();
  const mail = fakeMailer();
  await createUpdate(db, ana, SECRET, mail.sendMany);
  expect(mail.sent.map((e) => e.to)).toEqual(["sam@example.com"]);
});

it("names the family and carries the recipient's own unsubscribe links, never the update's text", async () => {
  const { family, ana, sam } = await setUp();
  const mail = fakeMailer();
  await createUpdate(db, ana, SECRET, mail.sendMany);
  const [email] = mail.sent;

  expect(email!.subject).toBe("New update from The Rivera Family");
  expect(email!.text).toContain(`/f/${family.slug}`);
  expect(email!.text).toContain(`/f/${family.slug}/unsubscribe#token=${sam.unsubscribeToken}`);
  expect(email!.headers).toEqual({
    "List-Unsubscribe": expect.stringContaining(`/api/f/${family.slug}/unsubscribe?token=${sam.unsubscribeToken}`),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  for (const part of [email!.subject, email!.text, JSON.stringify(email!.headers)]) {
    expect(part).not.toContain("Biopsy");
  }
});

it("sends nothing when posting without notifications, or when editing", async () => {
  const { ana } = await setUp();
  const mail = fakeMailer();
  const update = await createUpdate(db, ana, SECRET);
  await editUpdate(db, ana, update.id, "Edited");
  expect(mail.sent).toHaveLength(0);
});

it("keeps the update when the emails fail", async () => {
  const { ana } = await setUp();
  const failing: SendEmails = async () => {
    throw new Error("Resend is down");
  };
  await createUpdate(db, ana, SECRET, failing);
  expect(await db.update.count()).toBe(1);
});

it("unsubscribes only the token's own supporter, only at their family's address", async () => {
  const { family, okafor, sam, olu, otto } = await setUp();
  await db.person.update({ where: { id: otto.id }, data: { notificationsOn: true } });

  await unsubscribe(db, okafor.slug, sam.unsubscribeToken);
  expect(await notificationsOn(sam)).toBe(true);

  await unsubscribe(db, family.slug, sam.unsubscribeToken);
  expect(await notificationsOn(sam)).toBe(false);
  expect(await notificationsOn(otto)).toBe(true);
  expect(await notificationsOn(olu)).toBe(true);
});

it("ignores a malformed unsubscribe token without erroring", async () => {
  const { family, sam } = await setUp();
  await expect(unsubscribe(db, family.slug, "abc")).resolves.toBeUndefined();
  expect(await notificationsOn(sam)).toBe(true);
});

it("lets a supporter turn their own notifications off and on, but not a family member", async () => {
  const { ana, sam } = await setUp();
  await setNotifications(db, sam, false);
  expect(await notificationsOn(sam)).toBe(false);
  await setNotifications(db, sam, true);
  expect(await notificationsOn(sam)).toBe(true);
  await expect(setNotifications(db, ana, false)).rejects.toMatchObject({ status: 403 });
});

it("sends one-time verification emails only to unverified supporters", async () => {
  const { okafor, una } = await setUp();
  await supporter(okafor.id, "Uri", { verified: false });
  const mail = fakeMailer();

  const pending = await unverifiedSupporters(db);
  await sendVerifications(db, mail.sendMany, pending, "https://updates.example.org");

  expect(mail.sent.map((e) => e.to).sort()).toEqual(["uri@example.com", una.email].sort());
  expect(mail.sent[0]!.text).toMatch(/^Thanks for joining .*https:\/\/updates\.example\.org\/f\/[a-z0-9-]+\/verify#token=/s);
  expect(await db.magicLink.count({ where: { purpose: "verify" } })).toBe(2);
});
