import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getSession, requestSignInLink, signInWithLink, verifyEmail } from "../../server/auth.js";
import { answerGate } from "../../server/gate.js";
import type { Family, Person } from "../../server/generated/prisma/client.js";
import { changeQuestion, listPeople, setRemoved } from "../../server/people.js";
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

  it("treats another family's supporter, or a family member, as not found", async () => {
    const { ana, chidi, olu } = await setUp();
    await expect(setRemoved(db, ana, olu.person.id, true)).rejects.toMatchObject({ status: 404 });
    await expect(setRemoved(db, ana, chidi.id, true)).rejects.toMatchObject({ status: 404 });
    await expect(setRemoved(db, ana, ana.id, true)).rejects.toMatchObject({ status: 404 });
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
    expect(await verifyEmail(db, family.slug, verifyToken)).toBe(false);
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

    const restored = await setRemoved(db, ana, sam.person.id, false);
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
