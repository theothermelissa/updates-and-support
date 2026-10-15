import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getSession, signInWithLink, verifyEmail } from "../../server/auth.js";
import type { SendEmail } from "../../server/email.js";
import { addEmail, answerGate, gateInfo, lockGate, type Client, type GateResult } from "../../server/gate.js";
import type { Family } from "../../server/generated/prisma/client.js";
import { setRemoved } from "../../server/people.js";
import { createTestDb } from "./db.js";
import {
  answerCorrectly,
  fakeMailer,
  joinWithEmail,
  makeFamily,
  queuedOrDone,
  resetDb,
  tokenFrom,
} from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// makeFamily's accepted answer is "Biscuit".
const browserA: Client = { browserId: "browser-a", network: "203.0.113.1" };
const browserB: Client = { browserId: "browser-b", network: "198.51.100.1" };

async function rivera() {
  return (await makeFamily(db, "Rivera")).family;
}

async function wrongAnswers(family: Family, client: Client, count: number) {
  for (let i = 0; i < count; i++) {
    await answerGate(db, family, client, { answer: `guess ${i}` });
  }
}

// How many supporters and sessions exist.
function created() {
  return Promise.all([db.person.count({ where: { role: "supporter" } }), db.session.count()]);
}

describe("answering", () => {
  it("shows a visitor only the display name, the question, and where the family lives", async () => {
    const family = await rivera();
    expect(gateInfo(family)).toEqual({
      displayName: "The Rivera Family",
      question: "What is the dog's name?",
      slug: family.slug,
      home: `/f/${family.slug}`,
    });
  });

  it("gives the root family the site's root as its home, and no other family", async () => {
    const family = await rivera();
    const { family: other } = await makeFamily(db, "Okafor");
    process.env.ROOT_FAMILY_SLUG = family.slug;
    try {
      expect(gateInfo(family).home).toBe("/");
      expect(gateInfo(other).home).toBe(`/f/${other.slug}`);
    } finally {
      delete process.env.ROOT_FAMILY_SLUG;
    }
  });

  it("signs a correct answer in at once, as a new supporter of this family only, with no name or email", async () => {
    const family = await rivera();
    const { family: other } = await makeFamily(db, "Okafor");
    const result = await answerGate(db, family, browserA, { answer: "  the BISCUIT " });

    expect(result.result).toBe("joined");
    if (result.result !== "joined") return;
    expect(result.person).toMatchObject({
      familyId: family.id,
      role: "supporter",
      name: null,
      email: null,
      emailVerifiedAt: null,
    });
    expect((await getSession(db, family.slug, result.sessionToken))?.id).toBe(result.person.id);
    expect(await getSession(db, other.slug, result.sessionToken)).toBeNull();
    expect(await db.gateAttempt.count()).toBe(0);
  });

  it("creates nothing for a wrong answer, and records it", async () => {
    const family = await rivera();
    expect(await answerGate(db, family, browserA, { answer: "Rover" })).toEqual({ result: "wrong" });
    expect(await db.gateAttempt.count()).toBe(1);
    expect(await created()).toEqual([0, 0]);
  });

  it("makes each correct answer a separate supporter with its own session", async () => {
    const family = await rivera();
    const first = await answerCorrectly(db, family);
    const second = await answerCorrectly(db, family);
    expect(second.person.id).not.toBe(first.person.id);
    expect((await getSession(db, family.slug, first.sessionToken))?.id).toBe(first.person.id);
    expect((await getSession(db, family.slug, second.sessionToken))?.id).toBe(second.person.id);
  });

  it("checks an answer against the answers as they stand once it holds the gate lock", async () => {
    const family = await rivera();
    let answering!: Promise<GateResult>;
    await db.$transaction(
      async (tx) => {
        // Stands in for a change of answers, holding the lock while the answer waits for it.
        await lockGate(tx, family.id);
        answering = answerGate(db, family, browserA, { answer: "Biscuit" });
        await queuedOrDone(db, answering);
        await tx.family.update({ where: { id: family.id }, data: { acceptedAnswers: ["Lisbon"] } });
      },
      { timeout: 10_000 },
    );
    // `family` still holds the old answer, as it would for a request that loaded it earlier.
    expect(await answering).toEqual({ result: "wrong" });
    expect(await created()).toEqual([0, 0]);
  });

  it("refuses even a correct answer after 5 wrong ones from a browser, leaving other browsers alone", async () => {
    const family = await rivera();
    await wrongAnswers(family, browserA, 5);
    expect(await answerGate(db, family, browserA, { answer: "Biscuit" })).toEqual({ result: "limited" });
    expect(await created()).toEqual([0, 0]);
    expect((await answerGate(db, family, browserB, { answer: "Biscuit" })).result).toBe("joined");
  });

  it("refuses answers after 30 wrong ones from a network, across browsers", async () => {
    const family = await rivera();
    for (let i = 0; i < 30; i++) {
      await wrongAnswers(family, { browserId: `browser-${i}`, network: "203.0.113.1" }, 1);
    }
    const fresh = { browserId: "fresh", network: "203.0.113.1" };
    expect(await answerGate(db, family, fresh, { answer: "Biscuit" })).toEqual({ result: "limited" });
    expect(await created()).toEqual([0, 0]);
  });

  it("lets at most 30 of 40 parallel wrong answers from one network through", async () => {
    const family = await rivera();
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        answerGate(db, family, { browserId: `b${i}`, network: "203.0.113.1" }, { answer: "Rover" }),
      ),
    );
    expect(results.filter((r) => r.result === "wrong")).toHaveLength(30);
    expect(results.filter((r) => r.result === "limited")).toHaveLength(10);
  });

  it("doesn't count one family's wrong answers against another", async () => {
    const family = await rivera();
    const { family: other } = await makeFamily(db, "Okafor");
    await wrongAnswers(family, browserA, 5);
    expect((await answerGate(db, other, browserA, { answer: "Biscuit" })).result).toBe("joined");
  });
});

describe("giving an email", () => {
  const sam = { name: " Sam Friend ", email: " Sam@Example.com " };

  it("puts a new email on the reader's own record, unverified, and sends it a link to confirm", async () => {
    const family = await rivera();
    const reader = await answerCorrectly(db, family);
    const mail = fakeMailer();
    expect(await addEmail(db, mail.send, family, reader.person, sam)).toEqual({ result: "verify" });

    expect(await db.person.findUniqueOrThrow({ where: { id: reader.person.id } })).toMatchObject({
      name: "Sam Friend",
      email: "sam@example.com",
      emailVerifiedAt: null,
      notificationsOn: true,
    });
    expect((await getSession(db, family.slug, reader.sessionToken))?.id).toBe(reader.person.id);
    expect(mail.sent.map((m) => m.to)).toEqual(["sam@example.com"]);
    expect(mail.sent[0]!.text).toContain(`/f/${family.slug}/verify#token=`);
    expect(await verifyEmail(db, family.slug, tokenFrom(mail.sent[0]!))).not.toBeNull();
  });

  it("never attaches an email already in the family, and sends its owner a sign-in link instead", async () => {
    const { family, people: [ana] } = await makeFamily(db, "Rivera");
    const tess = await joinWithEmail(db, family, "Tess");
    const reader = await answerCorrectly(db, family, browserB);
    const before = await db.person.findMany({ orderBy: { id: "asc" } });

    const links = [];
    for (const email of [" TESS@example.com", "ana.rivera@example.com"]) {
      const mail = fakeMailer();
      expect(await addEmail(db, mail.send, family, reader.person, { name: "Someone Else", email })).toEqual({
        result: "sign-in-link",
      });
      expect(mail.sent.map((m) => m.to)).toEqual([email.trim().toLowerCase()]);
      links.push(tokenFrom(mail.sent[0]!));
    }

    expect(await db.person.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect((await getSession(db, family.slug, reader.sessionToken))?.id).toBe(reader.person.id);
    // Each link signs in as the email's owner, never as the reader.
    expect((await signInWithLink(db, family.slug, links[0]!))?.person.id).toBe(tess.person.id);
    expect((await signInWithLink(db, family.slug, links[1]!))?.person.id).toBe(ana!.id);
  });

  it("treats an email known only in another family as new", async () => {
    const family = await rivera();
    const { family: okafor } = await makeFamily(db, "Okafor");
    await joinWithEmail(db, okafor, "Sam");
    const reader = await answerCorrectly(db, family);
    expect(await addEmail(db, fakeMailer().send, family, reader.person, sam)).toEqual({ result: "verify" });
    expect(await db.person.count({ where: { email: "sam@example.com" } })).toBe(2);
  });

  it("refuses a removed supporter's or family member's email, changing and sending nothing", async () => {
    const { family, people: [ana, ben] } = await makeFamily(db, "Rivera", ["Ana", "Ben"]);
    const tess = await joinWithEmail(db, family, "Tess");
    await setRemoved(db, ana!, tess.person.id, true);
    await setRemoved(db, ana!, ben!.id, true);
    const reader = await answerCorrectly(db, family);
    const before = await db.person.findMany({ orderBy: { id: "asc" } });
    const mail = fakeMailer();

    for (const email of ["tess@example.com", "ben.rivera@example.com"]) {
      await expect(addEmail(db, mail.send, family, reader.person, { name: "Someone", email })).rejects.toMatchObject({
        status: 403,
        message: "This email can't join this family's updates. Please contact the family.",
      });
    }
    expect(mail.sent).toHaveLength(0);
    expect(await db.person.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("refuses a supporter who already has an email, and a family member", async () => {
    const { family, people: [ana] } = await makeFamily(db, "Rivera");
    const reader = await answerCorrectly(db, family);
    await addEmail(db, fakeMailer().send, family, reader.person, sam);
    const withEmail = await db.person.findUniqueOrThrow({ where: { id: reader.person.id } });
    const other = { name: "Sam Again", email: "other@example.com" };

    await expect(addEmail(db, fakeMailer().send, family, withEmail, other)).rejects.toMatchObject({ status: 409 });
    // As if a second submission was authorized before the first one landed.
    await expect(addEmail(db, fakeMailer().send, family, reader.person, other)).rejects.toMatchObject({ status: 409 });
    await expect(addEmail(db, fakeMailer().send, family, ana!, other)).rejects.toMatchObject({ status: 409 });
    expect(await db.person.findUniqueOrThrow({ where: { id: reader.person.id } })).toMatchObject({
      email: "sam@example.com",
    });
    expect(await db.person.count({ where: { email: "other@example.com" } })).toBe(0);
    // Only the first email's link exists, so nothing can verify the record's email but its owner.
    expect(await db.magicLink.count({ where: { personId: reader.person.id } })).toBe(1);
  });

  it("rejects an invalid name or email, changing nothing", async () => {
    const family = await rivera();
    const reader = await answerCorrectly(db, family);
    for (const input of [
      { name: "", email: "a@example.com" },
      { name: "Sam", email: "not-an-email" },
      { name: "Sam", email: "juice@no" },
    ]) {
      await expect(addEmail(db, fakeMailer().send, family, reader.person, input)).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.person.findUniqueOrThrow({ where: { id: reader.person.id } })).toMatchObject({
      name: null,
      email: null,
    });
  });

  it("gives a new email to only one of two readers at once; the other gets a sign-in link", async () => {
    // Repeated because a single race can come out right by timing alone.
    for (let i = 0; i < 10; i++) {
      await resetDb(db);
      const family = await rivera();
      const readers = [await answerCorrectly(db, family), await answerCorrectly(db, family, browserB)];
      const results = await Promise.all(readers.map((r) => addEmail(db, fakeMailer().send, family, r.person, sam)));
      expect(results.map((r) => r.result).sort()).toEqual(["sign-in-link", "verify"]);
      expect(await db.person.count({ where: { email: "sam@example.com" } })).toBe(1);
    }
  });

  it("still adds the email when the verification email fails", async () => {
    const failing: SendEmail = async () => {
      throw new Error("Resend is down");
    };
    const family = await rivera();
    const reader = await answerCorrectly(db, family);
    expect(await addEmail(db, failing, family, reader.person, sam)).toEqual({ result: "verify" });
    expect(await db.person.findUniqueOrThrow({ where: { id: reader.person.id } })).toMatchObject({
      email: "sam@example.com",
    });
  });
});
