import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  getSession,
  requestSignInLink,
  signInWithLink,
  signOut,
} from "../../server/auth.js";
import { createTestDb } from "./db.js";
import { fakeMailer, makeFamily, resetDb, tokenFrom } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// Requests a link for the email and signs in with it. Returns the session token.
async function signIn(slug: string, email: string) {
  const mail = fakeMailer();
  await requestSignInLink(db, mail.send, slug, email);
  const result = await signInWithLink(db, slug, tokenFrom(mail.sent[0]!));
  return result!.sessionToken;
}

describe("magic links", () => {
  it("emails one link to a known email and none to an unknown one, returning the same value", async () => {
    const { family } = await makeFamily(db, "Rivera");
    const mail = fakeMailer();

    const known = await requestSignInLink(db, mail.send, family.slug, " Ana.Rivera@Example.com ");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe("ana.rivera@example.com");
    expect(mail.sent[0]!.text).toContain(`/f/${family.slug}/sign-in#token=`);

    const unknown = await requestSignInLink(db, mail.send, family.slug, "nobody@example.com");
    expect(mail.sent).toHaveLength(1);
    expect(unknown).toEqual(known);
  });

  it("sends nothing when the email belongs to a different family", async () => {
    await makeFamily(db, "Rivera");
    const { family: other } = await makeFamily(db, "Okafor");
    const mail = fakeMailer();

    await requestSignInLink(db, mail.send, other.slug, "ana.rivera@example.com");
    expect(mail.sent).toHaveLength(0);
  });

  it("signs in once; a second use fails", async () => {
    const { family, people } = await makeFamily(db, "Rivera");
    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, "ana.rivera@example.com");
    const token = tokenFrom(mail.sent[0]!);

    const first = await signInWithLink(db, family.slug, token);
    expect(first?.person.id).toBe(people[0]!.id);
    expect(await signInWithLink(db, family.slug, token)).toBeNull();
  });

  it("rejects an expired link", async () => {
    const { family } = await makeFamily(db, "Rivera");
    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, "ana.rivera@example.com");
    await db.magicLink.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!))).toBeNull();
  });

  it("rejects a link from family A at family B's sign-in", async () => {
    const { family } = await makeFamily(db, "Rivera");
    const { family: other } = await makeFamily(db, "Okafor");
    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, "ana.rivera@example.com");
    const token = tokenFrom(mail.sent[0]!);

    expect(await signInWithLink(db, other.slug, token)).toBeNull();
    // The failed attempt didn't spend it.
    expect(await signInWithLink(db, family.slug, token)).not.toBeNull();
  });

  it("stores only hashes of link and session tokens", async () => {
    const { family } = await makeFamily(db, "Rivera");
    const mail = fakeMailer();
    await requestSignInLink(db, mail.send, family.slug, "ana.rivera@example.com");
    const linkToken = tokenFrom(mail.sent[0]!);
    const { sessionToken } = (await signInWithLink(db, family.slug, linkToken))!;

    const dump = JSON.stringify([await db.magicLink.findMany(), await db.session.findMany()]);
    expect(dump).not.toContain(linkToken);
    expect(dump).not.toContain(sessionToken);
  });

  it("sends nothing on the sixth request within an hour", async () => {
    const { family } = await makeFamily(db, "Rivera");
    const mail = fakeMailer();
    for (let i = 0; i < 6; i++) {
      await requestSignInLink(db, mail.send, family.slug, "ana.rivera@example.com");
    }
    expect(mail.sent).toHaveLength(5);
  });
});

describe("sessions", () => {
  it("is accepted in its own family and refused in another", async () => {
    const { family, people } = await makeFamily(db, "Rivera");
    const { family: other } = await makeFamily(db, "Okafor");
    const session = await signIn(family.slug, "ana.rivera@example.com");

    expect((await getSession(db, family.slug, session))?.id).toBe(people[0]!.id);
    expect(await getSession(db, other.slug, session)).toBeNull();
  });

  it("returns null once expired", async () => {
    const { family } = await makeFamily(db, "Rivera");
    const session = await signIn(family.slug, "ana.rivera@example.com");
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await getSession(db, family.slug, session)).toBeNull();
  });

  it("returns null after sign-out", async () => {
    const { family } = await makeFamily(db, "Rivera");
    const session = await signIn(family.slug, "ana.rivera@example.com");
    await signOut(db, session);

    expect(await getSession(db, family.slug, session)).toBeNull();
  });
});
