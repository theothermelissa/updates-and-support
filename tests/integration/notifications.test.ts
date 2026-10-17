import { afterAll, beforeEach, expect, it } from "vitest";
import { appUrl, type SendEmails } from "../../server/email.js";
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

type Options = { verified?: boolean; on?: boolean; removed?: boolean };

async function person(familyId: string, role: "family" | "supporter", name: string, options: Options = {}) {
  return db.person.create({
    data: {
      familyId,
      role,
      name,
      email: `${name.toLowerCase()}@example.com`,
      emailVerifiedAt: options.verified === false ? null : new Date(),
      notificationsOn: options.on ?? true,
      removedAt: options.removed ? new Date() : null,
    },
  });
}

const supporter = (familyId: string, name: string, options: Options = {}) => person(familyId, "supporter", name, options);
const familyMember = (familyId: string, name: string, options: Options = {}) => person(familyId, "family", name, options);

// The Rivera family with one family member and one supporter of each kind, plus the Okafor
// family's people. Ana, the family member who posts, is verified, as family members are once
// they've signed in; Ben has never signed in.
async function setUp() {
  const { family, people: [created] } = await makeFamily(db, "Rivera");
  const ana = await db.person.update({ where: { id: created!.id }, data: { emailVerifiedAt: new Date() } });
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const people = {
    ana: ana!,
    ben: await familyMember(family.id, "Ben", { verified: false }),
    fay: await familyMember(family.id, "Fay", { on: false }),
    // Removed, but opted in, so only the removed check keeps them out.
    rue: await familyMember(family.id, "Rue", { removed: true }),
    chidi: chidi!,
    sam: await supporter(family.id, "Sam"),
    una: await supporter(family.id, "Una", { verified: false }),
    otto: await supporter(family.id, "Otto", { on: false }),
    // Removed, but still verified and opted in, so only the removed check keeps them out.
    rex: await supporter(family.id, "Rex", { removed: true }),
    olu: await supporter(okafor.id, "Olu"),
    // A reader who never gave an email, with notifications on by default.
    reader: await db.person.create({ data: { familyId: family.id, role: "supporter" } }),
  };
  return { family, okafor, ...people };
}

async function notificationsOn(person: Person) {
  return (await db.person.findUniqueOrThrow({ where: { id: person.id } })).notificationsOn;
}

it("emails this family's opted-in, active family members but the author, and its verified, opted-in, active supporters", async () => {
  const { ana } = await setUp();
  const mail = fakeMailer();
  await createUpdate(db, ana, { body: SECRET }, mail.sendMany);
  expect(mail.sent.map((e) => e.to).sort()).toEqual(["ben@example.com", "sam@example.com"]);
});

it("names the family and carries the recipient's own unsubscribe links, never the update's text", async () => {
  const { family, ana, sam } = await setUp();
  const mail = fakeMailer();
  await createUpdate(db, ana, { body: SECRET }, mail.sendMany);
  const email = mail.sent.find((e) => e.to === sam.email);

  expect(email!.subject).toBe("The Rivera Family has a new update");
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

it("says how many photos an update has, and nothing of its text or captions", async () => {
  const { ana } = await setUp();
  const placeholders = { placeholders: true };
  const photo = (caption: string) => ({ type: "photo", attrs: { caption, placeholder: true } });
  const text = { type: "paragraph", content: [{ type: "text", text: SECRET }] };
  const subjects = [];
  for (const content of [
    [text, photo("Biopsy room"), photo("")],
    [photo("Biopsy room")],
    [text],
  ]) {
    const mail = fakeMailer();
    await createUpdate(db, ana, { content: { type: "doc", content } }, mail.sendMany, placeholders);
    const [email] = mail.sent;
    subjects.push(email!.subject);
    for (const part of [email!.subject, email!.text, JSON.stringify(email!.headers)]) {
      expect(part).not.toContain("Biopsy");
    }
  }
  expect(subjects).toEqual([
    "The Rivera Family has a new update (2 photos)",
    "The Rivera Family has a new update (1 photo)",
    "The Rivera Family has a new update",
  ]);
});

it("links the root family's notification emails to the site's root", async () => {
  const { family, ana } = await setUp();
  process.env.ROOT_FAMILY_SLUG = family.slug;
  try {
    const mail = fakeMailer();
    await createUpdate(db, ana, { body: SECRET }, mail.sendMany);
    expect(mail.sent[0]!.text).toContain(`Read it here:\n\n${appUrl()}/\n`);
  } finally {
    delete process.env.ROOT_FAMILY_SLUG;
  }
});

it("sends nothing when posting without notifications, or when editing", async () => {
  const { ana } = await setUp();
  const mail = fakeMailer();
  const update = await createUpdate(db, ana, { body: SECRET });
  await editUpdate(db, ana, update.id, { body: "Edited" });
  expect(mail.sent).toHaveLength(0);
});

it("keeps the update when the emails fail", async () => {
  const { ana } = await setUp();
  const failing: SendEmails = async () => {
    throw new Error("Resend is down");
  };
  await createUpdate(db, ana, { body: SECRET }, failing);
  expect(await db.update.count()).toBe(1);
});

it("unsubscribes only the token's own person, only at their family's address", async () => {
  const { family, okafor, sam, ben, olu, otto } = await setUp();
  await db.person.update({ where: { id: otto.id }, data: { notificationsOn: true } });

  await unsubscribe(db, okafor.slug, sam.unsubscribeToken);
  expect(await notificationsOn(sam)).toBe(true);

  await unsubscribe(db, family.slug, sam.unsubscribeToken);
  expect(await notificationsOn(sam)).toBe(false);
  expect(await notificationsOn(otto)).toBe(true);
  expect(await notificationsOn(olu)).toBe(true);

  await unsubscribe(db, okafor.slug, ben.unsubscribeToken);
  expect(await notificationsOn(ben)).toBe(true);
  await unsubscribe(db, family.slug, ben.unsubscribeToken);
  expect(await notificationsOn(ben)).toBe(false);
});

it("ignores a malformed unsubscribe token without erroring", async () => {
  const { family, sam } = await setUp();
  await expect(unsubscribe(db, family.slug, "abc")).resolves.toBeUndefined();
  expect(await notificationsOn(sam)).toBe(true);
});

it("lets supporters and family members turn their own notifications off and on", async () => {
  const { ana, sam } = await setUp();
  for (const p of [sam, ana]) {
    await setNotifications(db, p, false);
    expect(await notificationsOn(p)).toBe(false);
    await setNotifications(db, p, true);
    expect(await notificationsOn(p)).toBe(true);
  }
});

it("sends one-time verification emails only to unverified, active supporters with an email", async () => {
  const { family, okafor, una } = await setUp();
  await supporter(okafor.id, "Uri", { verified: false });
  await supporter(family.id, "Ula", { verified: false, removed: true });
  await db.person.create({ data: { familyId: family.id, role: "supporter" } });
  const mail = fakeMailer();

  const pending = await unverifiedSupporters(db);
  await sendVerifications(db, mail.sendMany, pending, "https://updates.example.org");

  expect(mail.sent.map((e) => e.to).sort()).toEqual(["uri@example.com", una.email].sort());
  expect(mail.sent[0]!.text).toMatch(/^Please confirm your email .*https:\/\/updates\.example\.org\/f\/[a-z0-9-]+\/verify#token=/s);
  expect(await db.magicLink.count({ where: { purpose: "verify" } })).toBe(2);
});
