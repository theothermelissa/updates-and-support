import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getSession } from "../../server/auth.js";
import { answerGate, gateInfo, type Client } from "../../server/gate.js";
import { createTestDb } from "./db.js";
import { fakeMailer, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// makeFamily's accepted answer is "Biscuit".
const browserA: Client = { browserId: "browser-a", network: "203.0.113.1" };
const browserB: Client = { browserId: "browser-b", network: "198.51.100.1" };

async function rivera() {
  return (await makeFamily(db, "Rivera")).family;
}

async function wrongAnswers(family: Awaited<ReturnType<typeof rivera>>, client: Client, count: number) {
  for (let i = 0; i < count; i++) {
    await answerGate(db, fakeMailer().send, family, client, { answer: `guess ${i}` });
  }
}

describe("answering", () => {
  it("shows a visitor only the display name and question", async () => {
    expect(gateInfo(await rivera())).toEqual({
      displayName: "The Rivera Family",
      question: "What is the dog's name?",
    });
  });

  it("accepts a normalized correct answer without recording it, and records a wrong one", async () => {
    const family = await rivera();
    const send = fakeMailer().send;
    expect(await answerGate(db, send, family, browserA, { answer: "  the BISCUIT " })).toEqual({ result: "correct" });
    expect(await db.gateAttempt.count()).toBe(0);
    expect(await answerGate(db, send, family, browserA, { answer: "Rover" })).toEqual({ result: "wrong" });
    expect(await db.gateAttempt.count()).toBe(1);
  });

  it("refuses even a correct answer after 5 wrong ones from a browser, leaving other browsers alone", async () => {
    const family = await rivera();
    await wrongAnswers(family, browserA, 5);
    expect(await answerGate(db, fakeMailer().send, family, browserA, { answer: "Biscuit" })).toEqual({
      result: "limited",
    });
    expect(await answerGate(db, fakeMailer().send, family, browserB, { answer: "Biscuit" })).toEqual({
      result: "correct",
    });
  });

  it("refuses answers after 30 wrong ones from a network, across browsers", async () => {
    const family = await rivera();
    for (let i = 0; i < 30; i++) {
      await wrongAnswers(family, { browserId: `browser-${i}`, network: "203.0.113.1" }, 1);
    }
    const fresh = { browserId: "fresh", network: "203.0.113.1" };
    expect(await answerGate(db, fakeMailer().send, family, fresh, { answer: "Biscuit" })).toEqual({
      result: "limited",
    });
  });

  it("lets at most 30 of 40 parallel wrong answers from one network through", async () => {
    const family = await rivera();
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        answerGate(db, fakeMailer().send, family, { browserId: `b${i}`, network: "203.0.113.1" }, { answer: "Rover" }),
      ),
    );
    expect(results.filter((r) => r.result === "wrong")).toHaveLength(30);
    expect(results.filter((r) => r.result === "limited")).toHaveLength(10);
  });

  it("doesn't count one family's wrong answers against another", async () => {
    const family = await rivera();
    const { family: other } = await makeFamily(db, "Okafor");
    await wrongAnswers(family, browserA, 5);
    expect(await answerGate(db, fakeMailer().send, other, browserA, { answer: "Biscuit" })).toEqual({
      result: "correct",
    });
  });
});

describe("joining", () => {
  const joiner = { name: " Sam Friend ", email: " Sam@Example.com " };

  it("creates nothing on a wrong answer", async () => {
    const family = await rivera();
    expect(await answerGate(db, fakeMailer().send, family, browserA, { answer: "Rover", ...joiner })).toEqual({
      result: "wrong",
    });
    expect(await db.person.count({ where: { role: "supporter" } })).toBe(0);
    expect(await db.session.count()).toBe(0);
  });

  it("creates nothing while limited, even with the correct answer", async () => {
    const family = await rivera();
    await wrongAnswers(family, browserA, 5);
    expect(await answerGate(db, fakeMailer().send, family, browserA, { answer: "Biscuit", ...joiner })).toEqual({
      result: "limited",
    });
    expect(await db.person.count({ where: { role: "supporter" } })).toBe(0);
    expect(await db.session.count()).toBe(0);
  });

  it("creates nothing when the name or email is invalid", async () => {
    const family = await rivera();
    const send = fakeMailer().send;
    await expect(answerGate(db, send, family, browserA, { answer: "Biscuit", name: "", email: "a@example.com" }))
      .rejects.toMatchObject({ status: 400 });
    await expect(answerGate(db, send, family, browserA, { answer: "Biscuit", name: "Sam", email: "not-an-email" }))
      .rejects.toMatchObject({ status: 400 });
    expect(await db.person.count({ where: { role: "supporter" } })).toBe(0);
  });

  it("signs a new email in as a supporter of this family only", async () => {
    const family = await rivera();
    const { family: other } = await makeFamily(db, "Okafor");
    const result = await answerGate(db, fakeMailer().send, family, browserA, { answer: "Biscuit", ...joiner });

    expect(result.result).toBe("joined");
    if (result.result !== "joined") return;
    expect(result.person).toMatchObject({ role: "supporter", name: "Sam Friend", email: "sam@example.com" });
    expect((await getSession(db, family.slug, result.sessionToken))?.id).toBe(result.person.id);
    expect(await getSession(db, other.slug, result.sessionToken)).toBeNull();
  });

  it("sends a link instead, changing nothing, when the email is already a supporter or family member", async () => {
    const family = await rivera();
    await answerGate(db, fakeMailer().send, family, browserA, { answer: "Biscuit", ...joiner });
    const before = await db.person.findMany({ orderBy: { email: "asc" } });
    const sessionsBefore = await db.session.count();

    for (const email of ["sam@example.com", "ANA.rivera@example.com"]) {
      const mail = fakeMailer();
      const result = await answerGate(db, mail.send, family, browserB, {
        answer: "Biscuit",
        name: "Someone Else",
        email,
      });
      expect(result).toEqual({ result: "check-email" });
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0]!.to).toBe(email.toLowerCase());
    }
    expect(await db.person.findMany({ orderBy: { email: "asc" } })).toEqual(before);
    expect(await db.session.count()).toBe(sessionsBefore);
  });
});
