import { afterAll, beforeEach, expect, it } from "vitest";
import { getSession, requestSignInLink, signInWithLink, verifyEmail } from "../../server/auth.js";
import type { SendEmail } from "../../server/email.js";
import { answerGate } from "../../server/gate.js";
import { createTestDb } from "./db.js";
import { fakeMailer, makeFamily, resetDb, tokenFrom } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const DAY = 24 * 60 * 60 * 1000;
const client = { browserId: "browser-a", network: "203.0.113.1" };

// Joins the Rivera family as a fictional supporter. Returns the family, the join
// result, and the emails sent.
async function joinRivera(send?: SendEmail) {
  const { family } = await makeFamily(db, "Rivera");
  const mail = fakeMailer();
  const result = await answerGate(db, send ?? mail.send, family, client, {
    answer: "Biscuit",
    name: "Sam Friend",
    email: "sam@example.com",
  });
  return { family, result, sent: mail.sent };
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

  expect(await verifyEmail(db, family.slug, tokenFrom(sent[0]!))).toBe(true);
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
  expect(await verifyEmail(db, family.slug, signInToken)).toBe(false);

  expect(await verifyEmail(db, family.slug, verifyToken)).toBe(true);
  expect(await signInWithLink(db, family.slug, signInToken)).not.toBeNull();
});

it("accepts a verification link once, and only at its own family", async () => {
  const { family, sent } = await joinRivera();
  const { family: other } = await makeFamily(db, "Okafor");
  const token = tokenFrom(sent[0]!);

  expect(await verifyEmail(db, other.slug, token)).toBe(false);
  expect(await verifyEmail(db, family.slug, token)).toBe(true);
  expect(await verifyEmail(db, family.slug, token)).toBe(false);
});

it("expires a verification link after 7 days", async () => {
  const { family, sent } = await joinRivera();
  const link = await db.magicLink.findFirstOrThrow({ where: { purpose: "verify" } });
  expect(Math.abs(link.expiresAt.getTime() - (Date.now() + 7 * DAY))).toBeLessThan(60_000);

  await db.magicLink.update({ where: { id: link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect(await verifyEmail(db, family.slug, tokenFrom(sent[0]!))).toBe(false);
});

it("marks the email verified when someone signs in by magic link", async () => {
  const { family } = await joinRivera();
  const mail = fakeMailer();
  await requestSignInLink(db, mail.send, family.slug, "sam@example.com");
  await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!));
  expect((await sam()).emailVerifiedAt).toBeInstanceOf(Date);
});

it("still signs the supporter in when the verification email fails", async () => {
  const failing: SendEmail = async () => {
    throw new Error("Resend is down");
  };
  const { family, result } = await joinRivera(failing);
  expect(result.result).toBe("joined");
  if (result.result !== "joined") return;
  expect((await getSession(db, family.slug, result.sessionToken))?.email).toBe("sam@example.com");
});
