import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getSession, requestSignInLink, signInWithLink, verifyEmail } from "../../server/auth.js";
import { answerGate } from "../../server/gate.js";
import type { Family, Person } from "../../server/generated/prisma/client.js";
import { addFamilyMember, addSupporter, changeQuestion, listPeople, setRemoved } from "../../server/people.js";
import { notifySupporters } from "../../server/notifications.js";
import { hashToken, newToken } from "../../server/tokens.js";
import { createTestDb } from "./db.js";
import { fakeMailer, makeFamily, resetDb, tokenFrom } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const client = { browserId: "browser-a", network: "203.0.113.1" };

// Joins a family through the gate as a fictional supporter. Returns them and their session token.
async function join(family: Family, name: string) {
  const email = `${name.toLowerCase()}@example.com`;
  const result = await answerGate(db, fakeMailer().send, family, client, {
    answer: "Biscuit",
    name,
    email,
  });
  if (result.result !== "joined") throw new Error(`Expected to join, got ${result.result}`);
  return { person: result.person, sessionToken: result.sessionToken };
}

// The Rivera family (Ana) with supporter Sam, and the Okafor family (Chidi) with supporter Olu.
async function setUp() {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const sam = await join(family, "Sam");
  const olu = await join(okafor, "Olu");
  return { family, okafor, ana: ana!, chidi: chidi!, sam, olu };
}

// Marks a person removed directly, skipping removal's cleanup, to test each entry point's own check.
function markRemoved(person: Person) {
  return db.person.update({ where: { id: person.id }, data: { removedAt: new Date() } });
}

describe("who may see and change", () => {
  it("lists only the family member's own family's supporters, with the question", async () => {
    const { ana, sam } = await setUp();
    const people = await listPeople(db, ana);
    expect(people.supporters.map((s) => s.email)).toEqual([sam.person.email]);
    expect(people.removed).toEqual([]);
    expect(people.question).toBe("What is the dog's name?");
    expect(people.acceptedAnswers).toEqual(["Biscuit"]);
  });

  it("refuses supporters everything", async () => {
    const { family, sam } = await setUp();
    const other = await join(family, "Tess");
    await expect(listPeople(db, sam.person)).rejects.toMatchObject({ status: 403 });
    await expect(setRemoved(db, sam.person, other.person.id, true)).rejects.toMatchObject({ status: 403 });
    await expect(setRemoved(db, sam.person, other.person.id, false)).rejects.toMatchObject({ status: 403 });
    await expect(
      changeQuestion(db, sam.person, { question: "Q?", answers: ["a"] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await getSession(db, family.slug, other.sessionToken)).not.toBeNull();
  });

  it("treats another family's supporter or family member as not found", async () => {
    const { ana, chidi, olu } = await setUp();
    await expect(setRemoved(db, ana, olu.person.id, true)).rejects.toMatchObject({ status: 404 });
    await expect(setRemoved(db, ana, chidi.id, true)).rejects.toMatchObject({ status: 404 });
    const untouched = await db.person.findMany({ where: { removedAt: { not: null } } });
    expect(untouched).toEqual([]);
  });

  it("rejects a removed flag that isn't a boolean", async () => {
    const { ana, sam } = await setUp();
    await expect(setRemoved(db, ana, sam.person.id, "yes")).rejects.toMatchObject({ status: 400 });
  });
});

describe("removal", () => {
  it("ends sessions, cancels unused links, turns notifications off, and lists them as removed", async () => {
    const { family, ana, sam } = await setUp();
    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, sam.person.email);

    await setRemoved(db, ana, sam.person.id, true);

    expect(await getSession(db, family.slug, sam.sessionToken)).toBeNull();
    expect(await db.magicLink.count({ where: { personId: sam.person.id, usedAt: null } })).toBe(0);
    expect(await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!))).toBeNull();
    const people = await listPeople(db, ana);
    expect(people.supporters).toEqual([]);
    expect(people.removed).toMatchObject([{ id: sam.person.id, notificationsOn: false }]);
  });

  it("refuses a surviving session of a removed person", async () => {
    const { family, sam } = await setUp();
    await markRemoved(sam.person);
    expect(await getSession(db, family.slug, sam.sessionToken)).toBeNull();
  });

  it("refuses a surviving sign-in or verify link of a removed person", async () => {
    const { family, sam } = await setUp();
    const signInToken = newToken();
    const verifyToken = newToken();
    const expiresAt = new Date(Date.now() + 60_000);
    await db.magicLink.createMany({
      data: [
        { personId: sam.person.id, tokenHash: hashToken(signInToken), expiresAt },
        { personId: sam.person.id, purpose: "verify", tokenHash: hashToken(verifyToken), expiresAt },
      ],
    });
    await db.person.update({ where: { id: sam.person.id }, data: { emailVerifiedAt: null } });
    await markRemoved(sam.person);

    expect(await signInWithLink(db, family.slug, signInToken)).toBeNull();
    expect(await verifyEmail(db, family.slug, verifyToken)).toBeNull();
    expect(await db.session.count({ where: { personId: sam.person.id } })).toBe(1); // only the original
  });

  it("sends a removed person no sign-in link", async () => {
    const { family, sam } = await setUp();
    await markRemoved(sam.person);
    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, sam.person.email);
    expect(mail.sent).toHaveLength(0);
  });

  it("refuses a removed email at the gate, sending and creating nothing", async () => {
    const { family, sam } = await setUp();
    await markRemoved(sam.person);
    const before = {
      people: await db.person.count(),
      sessions: await db.session.count(),
      links: await db.magicLink.count(),
    };
    const mail = fakeMailer();

    await expect(
      answerGate(db, mail.send, family, client, { answer: "Biscuit", name: "Sam Again", email: " SAM@example.com " }),
    ).rejects.toMatchObject({
      status: 403,
      message: "This email can't join this family's updates. Please contact the family.",
    });
    expect(mail.sent).toHaveLength(0);
    expect({
      people: await db.person.count(),
      sessions: await db.session.count(),
      links: await db.magicLink.count(),
    }).toEqual(before);
  });
});

describe("restore", () => {
  it("lets them sign in by email again, with notifications still off and no new session", async () => {
    const { family, ana, sam } = await setUp();
    await setRemoved(db, ana, sam.person.id, true);

    await setRemoved(db, ana, sam.person.id, false);
    const restored = await db.person.findUniqueOrThrow({ where: { id: sam.person.id } });
    expect(restored).toMatchObject({ removedAt: null, notificationsOn: false });
    expect(await db.session.count({ where: { personId: sam.person.id } })).toBe(0);

    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, sam.person.email);
    const signedIn = await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!));
    expect(signedIn?.person.id).toBe(sam.person.id);
    expect(signedIn?.person.notificationsOn).toBe(false);
  });
});

describe("changing the question", () => {
  it("applies to new answers only and signs no one out", async () => {
    const { family, ana, sam } = await setUp();
    await changeQuestion(db, ana, { question: "  Where did we honeymoon? ", answers: ["Lisbon", "  ", " Portugal "] });

    const updated = await db.family.findUniqueOrThrow({ where: { id: family.id } });
    expect(updated.question).toBe("Where did we honeymoon?");
    expect(updated.acceptedAnswers).toEqual(["Lisbon", "Portugal"]);
    expect(await answerGate(db, fakeMailer().send, updated, client, { answer: "Biscuit" })).toEqual({ result: "wrong" });
    expect(await answerGate(db, fakeMailer().send, updated, client, { answer: "lisbon" })).toEqual({ result: "correct" });
    expect(await getSession(db, family.slug, sam.sessionToken)).not.toBeNull();
  });

  it("rejects an empty question or no usable answers, changing nothing", async () => {
    const { family, ana } = await setUp();
    for (const input of [
      { question: "  ", answers: ["Lisbon"] },
      { question: "Where?", answers: [" ", ""] },
      { question: "Where?", answers: "Lisbon" },
      { question: "Where?", answers: [42] },
    ]) {
      await expect(changeQuestion(db, ana, input)).rejects.toMatchObject({ status: 400 });
    }
    const unchanged = await db.family.findUniqueOrThrow({ where: { id: family.id } });
    expect(unchanged.question).toBe("What is the dog's name?");
    expect(unchanged.acceptedAnswers).toEqual(["Biscuit"]);
  });
});

// Signs a person in by emailed link. Returns their session token.
async function signIn(slug: string, email: string) {
  const mail = fakeMailer();
  await requestSignInLink(db, mail.send, slug, email);
  return (await signInWithLink(db, slug, tokenFrom(mail.sent[0]!)))!.sessionToken;
}

function active(id: string) {
  return db.person.findFirst({ where: { id, removedAt: null } });
}

describe("adding family members", () => {
  it("creates a new family member and emails a link that signs them in as one", async () => {
    const { family, ana } = await setUp();
    const mail = fakeMailer();
    const result = await addFamilyMember(db, mail.send, ana, { name: " Bea Rivera ", email: "Bea@Example.com" });

    expect(result).toEqual({ name: "Bea Rivera", outcome: "added" });
    expect(mail.sent.map((e) => e.to)).toEqual(["bea@example.com"]);
    expect(mail.sent[0]!.subject).toBe("You've been added to The Rivera Family's updates");
    expect(mail.sent[0]!.text).toContain(`/f/${family.slug}/family`);
    const signedIn = await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!));
    expect(signedIn?.person).toMatchObject({ name: "Bea Rivera", role: "family" });
  });

  it("promotes a supporter: same record, new name, old session ended, family session from the link", async () => {
    const { family, ana, sam } = await setUp();
    const mail = fakeMailer();
    const result = await addFamilyMember(db, mail.send, ana, { name: "Samuel Friend", email: sam.person.email });

    expect(result.outcome).toBe("promoted");
    expect(await db.person.findUniqueOrThrow({ where: { id: sam.person.id } })).toMatchObject({
      role: "family",
      name: "Samuel Friend",
    });
    expect(await getSession(db, family.slug, sam.sessionToken)).toBeNull();
    const signedIn = await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!));
    expect(signedIn?.person).toMatchObject({ id: sam.person.id, role: "family" });
  });

  it("promotes and restores a removed supporter, and restores a removed family member", async () => {
    const { ana, sam } = await setUp();
    await setRemoved(db, ana, sam.person.id, true);
    expect((await addFamilyMember(db, fakeMailer().send, ana, { name: "Sam", email: sam.person.email })).outcome).toBe(
      "promoted",
    );
    expect(await active(sam.person.id)).toMatchObject({ role: "family" });

    await setRemoved(db, ana, sam.person.id, true);
    expect(await active(sam.person.id)).toBeNull();
    expect((await addFamilyMember(db, fakeMailer().send, ana, { name: "Sam", email: sam.person.email })).outcome).toBe(
      "restored",
    );
    expect(await active(sam.person.id)).toMatchObject({ role: "family" });
  });

  it("refuses a current family member's email, sending and changing nothing", async () => {
    const { ana } = await setUp();
    const links = await db.magicLink.count();
    const mail = fakeMailer();
    await expect(addFamilyMember(db, mail.send, ana, { name: "Someone Else", email: ana.email })).rejects.toMatchObject({
      status: 409,
    });
    expect(mail.sent).toHaveLength(0);
    expect(await db.person.findUniqueOrThrow({ where: { id: ana.id } })).toMatchObject({ name: ana.name });
    expect(await db.magicLink.count()).toBe(links);
  });

  it("is refused to supporters, and only ever adds to the adder's own family", async () => {
    const { family, okafor, ana, sam, olu } = await setUp();
    await expect(
      addFamilyMember(db, fakeMailer().send, sam.person, { name: "Mallory", email: "mallory@example.com" }),
    ).rejects.toMatchObject({ status: 403 });

    expect((await addFamilyMember(db, fakeMailer().send, ana, { name: "Olu", email: olu.person.email })).outcome).toBe(
      "added",
    );
    expect(await db.person.findUniqueOrThrow({ where: { id: olu.person.id } })).toMatchObject({
      role: "supporter",
      familyId: okafor.id,
    });
    expect(await getSession(db, okafor.slug, olu.sessionToken)).not.toBeNull();
    expect(await db.person.count({ where: { familyId: family.id, email: olu.person.email, role: "family" } })).toBe(1);
  });

  it("rejects an invalid name or email", async () => {
    const { ana } = await setUp();
    for (const input of [{ name: " ", email: "x@example.com" }, { name: "X", email: "not-an-email" }, {}]) {
      await expect(addFamilyMember(db, fakeMailer().send, ana, input)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("adds them even if the email can't be sent", async () => {
    const { ana } = await setUp();
    const failing = async () => {
      throw new Error("Resend is down");
    };
    await addFamilyMember(db, failing, ana, { name: "Bea", email: "bea@example.com" });
    expect(await db.person.count({ where: { email: "bea@example.com", role: "family" } })).toBe(1);
  });
});

describe("adding supporters", () => {
  it("creates an unverified supporter with notifications on and emails a link to confirm", async () => {
    const { family, ana } = await setUp();
    const mail = fakeMailer();
    const sessions = await db.session.count();
    expect(await addSupporter(db, mail.send, ana, { name: " Tess Neighbor ", email: "Tess@Example.com" })).toEqual({
      name: "Tess Neighbor",
    });

    expect(await db.person.findFirstOrThrow({ where: { email: "tess@example.com" } })).toMatchObject({
      familyId: family.id,
      role: "supporter",
      name: "Tess Neighbor",
      emailVerifiedAt: null,
      notificationsOn: true,
      removedAt: null,
    });
    expect(mail.sent.map((e) => e.to)).toEqual(["tess@example.com"]);
    expect(mail.sent[0]!.subject).toBe("The Rivera Family added you to their updates");
    expect(mail.sent[0]!.text).toContain(`/f/${family.slug}/verify#token=`);
    expect(await db.session.count()).toBe(sessions);
  });

  it("refuses an email already in the family, sending and changing nothing", async () => {
    const { family, ana, sam } = await setUp();
    await addFamilyMember(db, fakeMailer().send, ana, { name: "Bea", email: "bea@example.com" });
    const bea = await db.person.findFirstOrThrow({ where: { email: "bea@example.com" } });
    await setRemoved(db, ana, bea.id, true);
    const tess = await join(family, "Tess");
    await setRemoved(db, ana, tess.person.id, true);

    const before = await db.person.findMany({ orderBy: { id: "asc" } });
    const links = await db.magicLink.count();
    const mail = fakeMailer();
    for (const [email, message] of [
      [sam.person.email, /already a supporter/],
      [tess.person.email, /removed/],
      [ana.email, /family member/],
      [bea.email, /family member/],
    ] as const) {
      await expect(addSupporter(db, mail.send, ana, { name: "Someone", email })).rejects.toMatchObject({
        status: 409,
        message: expect.stringMatching(message),
      });
    }
    expect(mail.sent).toHaveLength(0);
    expect(await db.magicLink.count()).toBe(links);
    expect(await db.person.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("is refused to supporters, and only ever adds to the adder's own family", async () => {
    const { family, okafor, ana, sam, olu } = await setUp();
    await expect(
      addSupporter(db, fakeMailer().send, sam.person, { name: "Mallory", email: "mallory@example.com" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db.person.count({ where: { email: "mallory@example.com" } })).toBe(0);

    // An email that's a supporter elsewhere is new here, and the other family's record is untouched.
    await addSupporter(db, fakeMailer().send, ana, { name: "Olu", email: olu.person.email });
    expect(await db.person.count({ where: { familyId: family.id, email: olu.person.email, role: "supporter" } })).toBe(1);
    expect(await db.person.findUniqueOrThrow({ where: { id: olu.person.id } })).toMatchObject({ familyId: okafor.id });
  });

  it("rejects an invalid name or email", async () => {
    const { ana } = await setUp();
    for (const input of [{ name: " ", email: "x@example.com" }, { name: "X", email: "not-an-email" }, {}]) {
      await expect(addSupporter(db, fakeMailer().send, ana, input)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("adds them even if the email can't be sent", async () => {
    const { ana } = await setUp();
    const failing = async () => {
      throw new Error("Resend is down");
    };
    await addSupporter(db, failing, ana, { name: "Tess", email: "tess@example.com" });
    expect(await db.person.count({ where: { email: "tess@example.com", role: "supporter" } })).toBe(1);
  });

  it("sends an added supporter no notifications until they confirm", async () => {
    const { family, ana } = await setUp();
    const mail = fakeMailer();
    await addSupporter(db, mail.send, ana, { name: "Tess", email: "tess@example.com" });

    const notified = fakeMailer();
    await notifySupporters(db, notified.sendMany, family.id);
    expect(notified.sent.map((e) => e.to)).not.toContain("tess@example.com");

    await verifyEmail(db, family.slug, tokenFrom(mail.sent[0]!));
    await notifySupporters(db, notified.sendMany, family.id);
    expect(notified.sent.map((e) => e.to)).toContain("tess@example.com");
  });
});

describe("removing family members", () => {
  async function twoMembers() {
    const { family, people } = await makeFamily(db, "Rivera", ["Ana", "Ben"]);
    const [ana, ben] = people as [Person, Person];
    return { family, ana, ben, anaToken: await signIn(family.slug, ana.email), benToken: await signIn(family.slug, ben.email) };
  }

  it("ends their access and keeps their updates, with their name", async () => {
    const { family, ana, ben, benToken } = await twoMembers();
    await db.update.create({ data: { familyId: family.id, authorId: ben.id, body: "From Ben" } });
    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, ben.email);

    await setRemoved(db, ana, ben.id, true);

    expect(await db.session.count({ where: { personId: ben.id } })).toBe(0);
    expect(await db.magicLink.count({ where: { personId: ben.id, usedAt: null } })).toBe(0);
    expect(await getSession(db, family.slug, benToken)).toBeNull();
    expect(await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!))).toBeNull();
    expect((await listPeople(db, ana)).familyMembers.map((m) => m.id)).toEqual([ana.id]);
    const update = await db.update.findFirstOrThrow({ include: { author: true } });
    expect(update.author.name).toBe("Ben Rivera");

    const again = fakeMailer();
    await requestSignInLink(db, again.send, family.slug, ben.email);
    expect(again.sent).toHaveLength(0);
    await expect(
      answerGate(db, fakeMailer().send, family, client, { answer: "Biscuit", name: "Ben", email: ben.email }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses removing yourself, and restoring a family member this way", async () => {
    const { ana, ben } = await twoMembers();
    await expect(setRemoved(db, ana, ana.id, true)).rejects.toMatchObject({ status: 400 });
    await expect(setRemoved(db, ana, ben.id, false)).rejects.toMatchObject({ status: 400 });
    expect(await active(ana.id)).not.toBeNull();
    expect(await active(ben.id)).not.toBeNull();
  });

  it("refuses a request from someone removed a moment ago, so the family keeps a member", async () => {
    const { ana, ben } = await twoMembers();
    await setRemoved(db, ana, ben.id, true);
    // Ben's request was authorized before his removal and arrives after it.
    await expect(setRemoved(db, ben, ana.id, true)).rejects.toMatchObject({ status: 403 });
    expect(await active(ana.id)).not.toBeNull();
  });

  it("leaves exactly one family member when two remove each other at once", async () => {
    // Repeated because a single race can come out right by timing alone.
    for (let i = 0; i < 20; i++) {
      await resetDb(db);
      const { family, ana, ben } = await twoMembers();
      const results = await Promise.allSettled([setRemoved(db, ana, ben.id, true), setRemoved(db, ben, ana.id, true)]);
      expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
      expect(await db.person.count({ where: { familyId: family.id, role: "family", removedAt: null } })).toBe(1);
    }
  });

  it("limits a session to the person's current role's lifetime", async () => {
    const { family, ana } = await setUp();
    const token = newToken();
    await db.session.create({
      data: {
        personId: ana.id,
        tokenHash: hashToken(token),
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 149 * 24 * 60 * 60 * 1000),
      },
    });
    expect(await getSession(db, family.slug, token)).toBeNull();
  });
});
