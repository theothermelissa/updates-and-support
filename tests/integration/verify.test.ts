import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getSession, requestSignInLink, signInWithLink, verifyEmail } from "../../server/auth.js";
import { answerGate, BROWSER_LIMIT, NETWORK_LIMIT, signInWithVerifyLink, type Client } from "../../server/gate.js";
import { addFamilyMember, addSupporter, setRemoved } from "../../server/people.js";
import { createTestDb } from "./db.js";
import { fakeMailer, joinWithEmail, makeFamily, resetDb, tokenFrom } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const DAY = 24 * 60 * 60 * 1000;

// A fictional supporter of the Rivera family who answered the question and gave their email,
// sam@example.com. Returns the family and the emails sent.
async function joinRivera() {
  const { family } = await makeFamily(db, "Rivera");
  const { sent } = await joinWithEmail(db, family, "Sam");
  return { family, sent };
}

async function sam() {
  return db.person.findFirstOrThrow({ where: { email: "sam@example.com" } });
}

it("emails a new supporter one verification link and leaves them unverified until it's used", async () => {
  const { family, sent } = await joinRivera();
  expect(sent).toHaveLength(1);
  expect(sent[0]!.to).toBe("sam@example.com");
  expect(sent[0]!.text).toContain(`/f/${family.slug}/verify#token=`);
  expect((await sam()).emailVerifiedAt).toBeNull();
});

it("verifies the email without starting a session", async () => {
  const { family, sent } = await joinRivera();
  const sessionsBefore = await db.session.count();

  expect(await verifyEmail(db, family.slug, tokenFrom(sent[0]!))).toEqual({ canSignIn: true });
  expect((await sam()).emailVerifiedAt).toBeInstanceOf(Date);
  expect(await db.session.count()).toBe(sessionsBefore);
});

it("never signs in with a verification link, nor verifies with a sign-in link; each still works for its own purpose", async () => {
  const { family, sent } = await joinRivera();
  const verifyToken = tokenFrom(sent[0]!);
  const mail = fakeMailer();
  await requestSignInLink(db, mail.send, family.slug, "sam@example.com");
  const signInToken = tokenFrom(mail.sent[0]!);

  expect(await signInWithLink(db, family.slug, verifyToken)).toBeNull();
  expect(await verifyEmail(db, family.slug, signInToken)).toBeNull();

  expect(await verifyEmail(db, family.slug, verifyToken)).not.toBeNull();
  expect(await signInWithLink(db, family.slug, signInToken)).not.toBeNull();
});

it("confirms repeatedly with a verification link, and only at its own family", async () => {
  const { family, sent } = await joinRivera();
  const { family: other } = await makeFamily(db, "Okafor");
  const token = tokenFrom(sent[0]!);

  expect(await verifyEmail(db, other.slug, token)).toBeNull();
  expect(await verifyEmail(db, family.slug, token)).toEqual({ canSignIn: true });
  expect(await verifyEmail(db, family.slug, token)).toEqual({ canSignIn: true });
  expect(await db.magicLink.count({ where: { purpose: "verify", usedAt: { not: null } } })).toBe(0);
});

it("expires a verification link after 7 days", async () => {
  const { family, sent } = await joinRivera();
  const link = await db.magicLink.findFirstOrThrow({ where: { purpose: "verify" } });
  expect(Math.abs(link.expiresAt.getTime() - (Date.now() + 7 * DAY))).toBeLessThan(60_000);

  await db.magicLink.update({ where: { id: link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect(await verifyEmail(db, family.slug, tokenFrom(sent[0]!))).toBeNull();
});

it("marks the email verified when someone signs in by magic link", async () => {
  const { family } = await joinRivera();
  const mail = fakeMailer();
  await requestSignInLink(db, mail.send, family.slug, "sam@example.com");
  await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!));
  expect((await sam()).emailVerifiedAt).toBeInstanceOf(Date);
});

describe("signing in with a verification link and the answer", () => {
  // The link from joinRivera's verification email, used on a second device.
  const phone: Client = { browserId: "phone", network: "198.51.100.7" };

  async function setUp() {
    const { family, sent } = await joinRivera();
    return { family, token: tokenFrom(sent[0]!) };
  }

  function attempts() {
    return db.gateAttempt.count();
  }

  it("signs the supporter in once with the correct answer, as that supporter", async () => {
    const { family, token } = await setUp();
    const first = await signInWithVerifyLink(db, family, phone, token, " biscuit ");
    expect(first.result).toBe("signed-in");
    if (first.result !== "signed-in") return;
    expect(await getSession(db, family.slug, first.sessionToken)).toMatchObject({
      email: "sam@example.com",
      role: "supporter",
    });
    expect((await sam()).emailVerifiedAt).toBeInstanceOf(Date);

    expect(await signInWithVerifyLink(db, family, phone, token, "Biscuit")).toEqual({ result: "invalid" });
    // Confirming still works after the sign-in, and says the link can't sign in again.
    expect(await verifyEmail(db, family.slug, token)).toEqual({ canSignIn: false });
  });

  it("never signs in with the link alone or a wrong answer, and counts the wrong answer", async () => {
    const { family, token } = await setUp();
    const sessions = await db.session.count();
    expect(await signInWithVerifyLink(db, family, phone, token, "")).toEqual({ result: "wrong" });
    expect(await signInWithVerifyLink(db, family, phone, token, "Rex")).toEqual({ result: "wrong" });
    expect(await db.session.count()).toBe(sessions);
    expect(await attempts()).toBe(2);
  });

  it("shares the gate's limits, refusing even the correct answer once reached", async () => {
    const { family, token } = await setUp();
    for (let i = 0; i < BROWSER_LIMIT; i++) await signInWithVerifyLink(db, family, phone, token, `guess ${i}`);
    expect(await signInWithVerifyLink(db, family, phone, token, "Biscuit")).toEqual({ result: "limited" });

    await resetDb(db);
    const fresh = await setUp();
    for (let i = 0; i < NETWORK_LIMIT; i++) {
      await answerGate(db, fresh.family, { browserId: `b${i}`, network: phone.network }, { answer: "x" });
    }
    expect(await signInWithVerifyLink(db, fresh.family, phone, fresh.token, "Biscuit")).toEqual({ result: "limited" });
  });

  it("refuses an unusable link before checking the answer, so it records no attempt", async () => {
    const { family, token } = await setUp();
    const { family: okafor } = await makeFamily(db, "Okafor");
    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, "sam@example.com");
    const signInToken = tokenFrom(mail.sent[0]!);

    expect(await signInWithVerifyLink(db, okafor, phone, token, "Rex")).toEqual({ result: "invalid" });
    expect(await signInWithVerifyLink(db, family, phone, "not-a-token", "Rex")).toEqual({ result: "invalid" });
    expect(await signInWithVerifyLink(db, family, phone, signInToken, "Rex")).toEqual({ result: "invalid" });
    await db.magicLink.updateMany({ where: { purpose: "verify" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await signInWithVerifyLink(db, family, phone, token, "Rex")).toEqual({ result: "invalid" });
    expect(await attempts()).toBe(0);
  });

  it("never signs in a family member, even one promoted from supporter", async () => {
    const { family, token } = await setUp();
    const ana = await db.person.findFirstOrThrow({ where: { familyId: family.id, role: "family" } });
    await addFamilyMember(db, fakeMailer().send, ana, { name: "Sam Friend", email: "sam@example.com" });

    const sessions = await db.session.count();
    expect(await verifyEmail(db, family.slug, token)).toEqual({ canSignIn: false });
    expect(await signInWithVerifyLink(db, family, phone, token, "Biscuit")).toEqual({ result: "invalid" });
    expect(await db.session.count()).toBe(sessions);
  });

  it("never signs in a removed supporter", async () => {
    const { family, token } = await setUp();
    const supporter = await sam();
    // Mark removed directly, so removal's link cleanup doesn't hide this check.
    await db.person.update({ where: { id: supporter.id }, data: { removedAt: new Date() } });
    expect(await signInWithVerifyLink(db, family, phone, token, "Biscuit")).toEqual({ result: "invalid" });
    expect(await verifyEmail(db, family.slug, token)).toBeNull();
  });

  it("leaves no family-member session when sign-in races promotion", async () => {
    // Repeated because a single race can come out right by timing alone.
    for (let i = 0; i < 20; i++) {
      await resetDb(db);
      const { family, token } = await setUp();
      const ana = await db.person.findFirstOrThrow({ where: { familyId: family.id, role: "family" } });
      const supporter = await sam();
      await Promise.allSettled([
        signInWithVerifyLink(db, family, phone, token, "Biscuit"),
        addFamilyMember(db, fakeMailer().send, ana, { name: "Sam Friend", email: "sam@example.com" }),
      ]);
      // Promotion signs Sam out; a family-member session only ever comes from promotion's own email.
      expect(await db.session.count({ where: { personId: supporter.id } })).toBe(0);
    }
  });

  it("leaves no session when sign-in races removal", async () => {
    for (let i = 0; i < 20; i++) {
      await resetDb(db);
      const { family, token } = await setUp();
      const ana = await db.person.findFirstOrThrow({ where: { familyId: family.id, role: "family" } });
      const supporter = await sam();
      await Promise.allSettled([
        signInWithVerifyLink(db, family, phone, token, "Biscuit"),
        setRemoved(db, ana, supporter.id, true),
      ]);
      expect(await db.session.count({ where: { personId: supporter.id } })).toBe(0);
    }
  });

  it("works for a supporter a family member added", async () => {
    const { family, people } = await makeFamily(db, "Rivera");
    const mail = fakeMailer();
    await addSupporter(db, mail.send, people[0]!, { name: "Tess Neighbor", email: "tess@example.com" });
    const token = tokenFrom(mail.sent[0]!);
    expect(await verifyEmail(db, family.slug, token)).toEqual({ canSignIn: true });
    const result = await signInWithVerifyLink(db, family, phone, token, "Biscuit");
    expect(result.result).toBe("signed-in");
  });
});
