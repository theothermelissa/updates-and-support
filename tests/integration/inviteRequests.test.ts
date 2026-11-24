import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getSession, signInWithLink } from "../../server/auth.js";
import type { Db } from "../../server/db.js";
import { RequestError } from "../../server/errors.js";
import type { Family } from "../../server/generated/prisma/client.js";
import { personView } from "../../server/http.js";
import {
  approveInviteRequest,
  declineInviteRequest,
  NETWORK_LIMIT_PER_HOUR,
  PENDING_CAP,
  requestInvite,
} from "../../server/inviteRequests.js";
import { addFamilyMember, addSupporter, listPeople, setRemoved } from "../../server/people.js";
import { createTestDb } from "./db.js";
import { fakeMailer, makeFamily, resetDb, tokenFrom } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const net = (network: string) => ({ browserId: "browser-x", network });
const client = net("203.0.113.1");
const DAY = 24 * 60 * 60 * 1000;

async function status(work: Promise<unknown>) {
  try {
    await work;
    return 200;
  } catch (err) {
    if (err instanceof RequestError) return err.status;
    throw err;
  }
}

function ask(family: Family, who: { name?: unknown; email?: unknown; message?: unknown }, from = client, mail = fakeMailer()) {
  return requestInvite(db, mail.send, mail.sendMany, family, from, who);
}

const pending = (familyId: string) => db.inviteRequest.findMany({ where: { familyId } });
const sam = { name: "Sam Visitor", email: "sam@example.com", message: "I'm a neighbor." };

// An invite-only Rivera family: Ana (family, notifications on), Ben (family, notifications on),
// Cara (family, notifications off), Dan (family, removed); supporter Gia, and removed supporter
// Hal. Also an invite-only Okafor family (Chidi) and a Lopez family with a community question.
async function setUp() {
  const { family, people: [ana] } = await makeFamily(db, "Rivera", ["Ana"], { inviteOnly: true });
  const mail = fakeMailer();
  for (const first of ["Ben", "Cara", "Dan"]) {
    await addFamilyMember(db, mail.send, ana!, { name: `${first} Rivera`, email: `${first}.rivera@example.com` });
  }
  await db.person.updateMany({ where: { familyId: family.id, email: "cara.rivera@example.com" }, data: { notificationsOn: false } });
  await db.person.updateMany({ where: { familyId: family.id, email: "dan.rivera@example.com" }, data: { removedAt: new Date() } });
  await addSupporter(db, mail.send, ana!, { name: "Gia", email: "gia@example.com" });
  await addSupporter(db, mail.send, ana!, { name: "Hal", email: "hal@example.com" });
  await db.person.updateMany({ where: { familyId: family.id, email: "hal@example.com" }, data: { removedAt: new Date() } });
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"], { inviteOnly: true });
  const { family: lopez } = await makeFamily(db, "Lopez");
  const byEmail = (email: string) => db.person.findFirstOrThrow({ where: { familyId: family.id, email } });
  return { family, ana: ana!, okafor, chidi: chidi!, lopez, byEmail };
}

// A pending request inserted directly, skipping requestInvite's checks.
function plant(familyId: string, email: string, extra: { createdAt?: Date; network?: string } = {}) {
  return db.inviteRequest.create({
    data: { familyId, name: "Pat Visitor", email, network: extra.network ?? "198.51.100.9", createdAt: extra.createdAt },
  });
}

describe("asking for an invite", () => {
  it("stores the request and tells only active family members with notifications on, without the details", async () => {
    const { family } = await setUp();
    const mail = fakeMailer();
    expect(await ask(family, sam, client, mail)).toBe("thanks");
    const [row] = await pending(family.id);
    expect(row).toMatchObject({ name: "Sam Visitor", email: "sam@example.com", message: "I'm a neighbor.", network: client.network });
    expect(mail.sent.map((e) => e.to).sort()).toEqual(["ana.rivera@example.com", "ben.rivera@example.com"]);
    for (const email of mail.sent) {
      expect(email.subject).toBe("Someone asked to join The Rivera Family");
      const all = `${email.subject}\n${email.text}`;
      for (const secret of ["Sam", "sam@example.com", "neighbor"]) expect(all).not.toContain(secret);
      expect(email.text).toContain(`/f/${family.slug}/people`);
      expect(email.headers?.["List-Unsubscribe"]).toContain("/unsubscribe?token=");
    }
  });

  it("replies the same whoever the email belongs to, and stores a row only for an unknown one", async () => {
    const { family, byEmail } = await setUp();
    const cases = [
      { email: "gia@example.com", link: true }, // active supporter
      { email: "ben.rivera@example.com", link: true }, // active family member
      { email: "hal@example.com", link: false }, // removed supporter
      { email: "dan.rivera@example.com", link: false }, // removed family member
    ];
    for (const { email, link } of cases) {
      const mail = fakeMailer();
      const person = await byEmail(email);
      const linksBefore = await db.magicLink.count({ where: { personId: person.id } });
      expect(await ask(family, { name: "Someone", email }, client, mail), email).toBe("thanks");
      expect(await pending(family.id), email).toEqual([]);
      expect(await db.magicLink.count({ where: { personId: person.id } }) - linksBefore, email).toBe(link ? 1 : 0);
      expect(mail.sent.map((e) => [e.to, e.subject]), email).toEqual(
        link ? [[email, "Your sign-in link for The Rivera Family"]] : [],
      );
    }
    expect(await ask(family, sam)).toBe("thanks");
    expect(await pending(family.id)).toHaveLength(1);
  });

  it("stores a repeat for the same email once, tells the family once, and keeps the first details", async () => {
    const { family } = await setUp();
    const mail = fakeMailer();
    await ask(family, sam, client, mail);
    const first = mail.sent.length;
    expect(await ask(family, { name: "Other Name", email: "SAM@example.com ", message: "later" }, net("203.0.113.2"), mail)).toBe("thanks");
    expect(mail.sent).toHaveLength(first);
    const rows = await pending(family.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Sam Visitor", message: "I'm a neighbor." });
  });

  it("limits stored requests per network and hour, and still says thanks", async () => {
    const { family } = await setUp();
    for (let i = 0; i < NETWORK_LIMIT_PER_HOUR; i++) {
      await ask(family, { name: "V", email: `v${i}@example.com` });
    }
    const mail = fakeMailer();
    expect(await ask(family, { name: "V", email: "v6@example.com" }, client, mail)).toBe("thanks");
    expect(await pending(family.id)).toHaveLength(NETWORK_LIMIT_PER_HOUR);
    expect(mail.sent).toEqual([]);
    // Another network is unaffected.
    await ask(family, { name: "V", email: "v7@example.com" }, net("203.0.113.77"));
    expect(await pending(family.id)).toHaveLength(NETWORK_LIMIT_PER_HOUR + 1);
    // Rows older than an hour don't count.
    await db.inviteRequest.updateMany({ where: { network: client.network }, data: { createdAt: new Date(Date.now() - 2 * 3600_000) } });
    await ask(family, { name: "V", email: "v8@example.com" });
    expect(await db.inviteRequest.count({ where: { email: "v8@example.com" } })).toBe(1);
  });

  it("closes at the pending cap for anyone, stores and sends nothing, and gives members no link", async () => {
    const { family } = await setUp();
    await db.inviteRequest.createMany({
      data: Array.from({ length: PENDING_CAP }, (_, i) => ({ familyId: family.id, name: "P", email: `p${i}@example.com`, network: `n${i}` })),
    });
    for (const email of ["new@example.com", "ana.rivera@example.com", "gia@example.com", "hal@example.com"]) {
      const mail = fakeMailer();
      expect(await ask(family, { name: "X", email }, client, mail), email).toBe("closed");
      expect(mail.sent, email).toEqual([]);
    }
    expect(await pending(family.id)).toHaveLength(PENDING_CAP);
    expect(await db.magicLink.count({ where: { person: { email: "ana.rivera@example.com" } } })).toBe(0);
  });

  it("clears expired requests on the next request, so they don't count toward the cap", async () => {
    const { family } = await setUp();
    await db.inviteRequest.createMany({
      data: Array.from({ length: PENDING_CAP }, (_, i) => ({ familyId: family.id, name: "P", email: `p${i}@example.com`, network: `n${i}` })),
    });
    await db.inviteRequest.update({ where: { familyId_email: { familyId: family.id, email: "p0@example.com" } }, data: { createdAt: new Date(Date.now() - 31 * DAY) } });
    expect(await ask(family, sam)).toBe("thanks");
    expect(await db.inviteRequest.count({ where: { email: "p0@example.com" } })).toBe(0);
    expect(await db.inviteRequest.count({ where: { email: sam.email } })).toBe(1);
  });

  it("only takes requests for invite-only families", async () => {
    const { lopez } = await setUp();
    expect(await status(ask(lopez, sam))).toBe(403);
    expect(await pending(lopez.id)).toEqual([]);
  });

  it("refuses a bad name, email or message and stores nothing", async () => {
    const { family } = await setUp();
    const bad = [
      { name: "", email: sam.email },
      { name: "   ", email: sam.email },
      { name: "n".repeat(101), email: sam.email },
      { name: "Sam", email: "not-an-email" },
      { name: "Sam", email: undefined },
      { name: "Sam", email: sam.email, message: "m".repeat(501) },
      { name: "Sam", email: sam.email, message: 12 },
    ];
    for (const input of bad) expect(await status(ask(family, input)), JSON.stringify(input)).toBe(400);
    expect(await pending(family.id)).toEqual([]);
    // Exactly at the limits is fine, and an empty message is stored as none.
    await ask(family, { name: "n".repeat(100), email: sam.email, message: "  " });
    expect((await pending(family.id))[0]).toMatchObject({ message: null });
  });
});

describe("who may see and act on requests", () => {
  it("lists only invite-only families' unexpired requests, oldest first, to their family members", async () => {
    const { family, ana, okafor, chidi, lopez } = await setUp();
    await plant(family.id, "late@example.com", { createdAt: new Date(Date.now() - 1000) });
    await plant(family.id, "early@example.com", { createdAt: new Date(Date.now() - DAY) });
    await plant(family.id, "old@example.com", { createdAt: new Date(Date.now() - 31 * DAY) });
    await plant(okafor.id, "other@example.com");
    expect((await listPeople(db, ana)).inviteRequests.map((r) => r.email)).toEqual(["early@example.com", "late@example.com"]);
    expect((await listPeople(db, chidi)).inviteRequests.map((r) => r.email)).toEqual(["other@example.com"]);
    // A family that isn't invite-only lists none, even with a row planted directly.
    await plant(lopez.id, "planted@example.com");
    const lopezMember = await db.person.findFirstOrThrow({ where: { familyId: lopez.id, role: "family" } });
    expect((await listPeople(db, lopezMember)).inviteRequests).toEqual([]);
  });

  it("refuses a supporter, and treats another family's request id as not found", async () => {
    const { family, chidi, byEmail } = await setUp();
    const request = await plant(family.id, "pat@example.com");
    const gia = await byEmail("gia@example.com");
    expect(await status(listPeople(db, gia))).toBe(403);
    expect(await status(approveInviteRequest(db, fakeMailer().send, gia, request.id))).toBe(403);
    expect(await status(declineInviteRequest(db, gia, request.id))).toBe(403);
    expect(await status(approveInviteRequest(db, fakeMailer().send, chidi, request.id))).toBe(404);
    expect(await status(declineInviteRequest(db, chidi, request.id))).toBe(404);
    expect(await pending(family.id)).toHaveLength(1);
    expect(await db.person.count({ where: { email: "pat@example.com" } })).toBe(0);
  });

  it("turns away a family member once removed, because their session is gone", async () => {
    const { family, ana, byEmail } = await setUp();
    const mail = fakeMailer();
    await addFamilyMember(db, mail.send, ana, { name: "Eli Rivera", email: "eli.rivera@example.com" });
    const signedIn = await signInWithLink(db, family.slug, tokenFrom(await lastEmailTo(mail, "eli")));
    expect(signedIn).not.toBeNull();
    const eli = await byEmail("eli.rivera@example.com");
    await setRemoved(db, ana, eli.id, true);
    expect(await getSession(db, family.slug, signedIn!.sessionToken)).toBeNull();
  });

  it("puts a request's name, email and message in no response but the People page's", async () => {
    const { family, ana, chidi, lopez } = await setUp();
    await ask(family, sam);
    const lopezMember = await db.person.findFirstOrThrow({ where: { familyId: lopez.id, role: "family" } });
    const gia = await db.person.findFirstOrThrow({ where: { familyId: family.id, email: "gia@example.com" } });
    const leaked = (value: unknown) => {
      const text = JSON.stringify(value);
      return ["Sam Visitor", "sam@example.com", "neighbor"].filter((s) => text.includes(s));
    };
    for (const who of [ana, gia, chidi, lopezMember]) expect(leaked(personView(who))).toEqual([]);
    expect(leaked(await listPeople(db, chidi))).toEqual([]);
    expect(leaked(await listPeople(db, lopezMember))).toEqual([]);
    expect(leaked(await listPeople(db, ana))).toEqual(["Sam Visitor", "sam@example.com", "neighbor"]);
  });
});

// The most recent email to someone whose address starts with this name.
async function lastEmailTo(mail: ReturnType<typeof fakeMailer>, name: string) {
  const email = [...mail.sent].reverse().find((e) => e.to.startsWith(name));
  if (!email) throw new Error(`No email to ${name}`);
  return email;
}

describe("approving", () => {
  it("adds a supporter as Add supporter does, deletes the request, and the link signs them in and verifies", async () => {
    const { family, ana } = await setUp();
    const request = await plant(family.id, "pat@example.com");
    const mail = fakeMailer();
    expect(await approveInviteRequest(db, mail.send, ana, request.id)).toEqual({ added: true });
    expect(await pending(family.id)).toEqual([]);
    const pat = await db.person.findUniqueOrThrow({ where: { familyId_email: { familyId: family.id, email: "pat@example.com" } } });
    expect(pat).toMatchObject({ role: "supporter", name: "Pat Visitor", emailVerifiedAt: null, removedAt: null });
    expect(await db.groupMember.count({ where: { personId: pat.id } })).toBe(0);
    const [link] = await db.magicLink.findMany({ where: { personId: pat.id } });
    expect(link!.purpose).toBe("sign_in");
    expect(link!.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * DAY);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "pat@example.com", subject: "You've been added to The Rivera Family" });
    const signedIn = await signInWithLink(db, family.slug, tokenFrom(mail.sent[0]!));
    expect(signedIn?.person.id).toBe(pat.id);
    expect((await db.person.findUniqueOrThrow({ where: { id: pat.id } })).emailVerifiedAt).not.toBeNull();
  });

  it("clears the request and changes nothing when the email has since joined", async () => {
    const { family, ana, byEmail } = await setUp();
    const cases = [
      { email: "gia@example.com", reason: "supporter" },
      { email: "ben.rivera@example.com", reason: "family" },
      { email: "hal@example.com", reason: "removed" },
      { email: "dan.rivera@example.com", reason: "removed" },
    ];
    for (const { email, reason } of cases) {
      const before = await byEmail(email);
      const request = await plant(family.id, email);
      const mail = fakeMailer();
      expect(await approveInviteRequest(db, mail.send, ana, request.id), email).toEqual({ added: false, reason });
      expect(await byEmail(email), email).toEqual(before);
      expect(await db.inviteRequest.count({ where: { id: request.id } }), email).toBe(0);
      expect(mail.sent, email).toEqual([]);
    }
  });

  it("refuses a request planted on a family that isn't invite-only", async () => {
    const { family, people } = await makeFamily(db, "Rivera");
    const request = await plant(family.id, "plant@example.com");
    expect(await status(approveInviteRequest(db, fakeMailer().send, people[0]!, request.id))).toBe(404);
    expect(await db.person.count({ where: { email: "plant@example.com" } })).toBe(0);
  });

  it("treats an expired request as gone", async () => {
    const { family, ana } = await setUp();
    const request = await plant(family.id, "old@example.com", { createdAt: new Date(Date.now() - 31 * DAY) });
    expect(await status(approveInviteRequest(db, fakeMailer().send, ana, request.id))).toBe(404);
    expect(await db.person.count({ where: { email: "old@example.com" } })).toBe(0);
  });
});

describe("declining", () => {
  it("deletes the request and sends nothing", async () => {
    const { family, ana } = await setUp();
    const request = await plant(family.id, "pat@example.com");
    await declineInviteRequest(db, ana, request.id);
    expect(await pending(family.id)).toEqual([]);
    expect(await status(declineInviteRequest(db, ana, request.id))).toBe(404);
    expect(await db.person.count({ where: { email: "pat@example.com" } })).toBe(0);
    expect(await db.magicLink.count({ where: { person: { email: "pat@example.com" } } })).toBe(0);
  });
});

describe("races", () => {
  it("a decline then an approve of the same request creates no one", async () => {
    const { family, ana } = await setUp();
    const request = await plant(family.id, "pat@example.com");
    await declineInviteRequest(db, ana, request.id);
    expect(await status(approveInviteRequest(db, fakeMailer().send, ana, request.id))).toBe(404);
    expect(await db.person.count({ where: { email: "pat@example.com" } })).toBe(0);
  });

  it("two simultaneous approves make one supporter", async () => {
    const { family, ana } = await setUp();
    const request = await plant(family.id, "pat@example.com");
    const mail = fakeMailer();
    const results = await Promise.allSettled([
      approveInviteRequest(db, mail.send, ana, request.id),
      approveInviteRequest(db, mail.send, ana, request.id),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won.map((r) => r.value)).toEqual([{ added: true }]);
    expect(lost.map((r) => (r.reason as RequestError).status)).toEqual([404]);
    expect(await db.person.count({ where: { email: "pat@example.com" } })).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it("an approve that loses the create to Add supporter makes no second person and still clears the request", async () => {
    const { family, ana } = await setUp();
    const request = await plant(family.id, "pat@example.com");
    // Pause the approval after it has looked the email up and found no one, then add them.
    let addedBetween: Promise<unknown> | null = null;
    const paused = db.$extends({
      query: {
        person: {
          async findUnique({ args, query }) {
            const found = await query(args);
            if (!addedBetween && (args.where as { familyId_email?: unknown }).familyId_email) {
              addedBetween = addSupporter(db, fakeMailer().send, ana, { name: "Pat", email: "pat@example.com" });
              await addedBetween;
            }
            return found;
          },
        },
      },
    }) as unknown as Db;
    const result = await approveInviteRequest(paused, fakeMailer().send, ana, request.id);
    expect(result).toEqual({ added: false, reason: "supporter" });
    expect(await db.person.count({ where: { email: "pat@example.com" } })).toBe(1);
    expect(await pending(family.id)).toEqual([]);
  });

  it("an approve racing Add supporter for the same email makes one person and clears the request", async () => {
    const { family, ana } = await setUp();
    const request = await plant(family.id, "pat@example.com");
    const results = await Promise.allSettled([
      approveInviteRequest(db, fakeMailer().send, ana, request.id),
      addSupporter(db, fakeMailer().send, ana, { name: "Pat", email: "pat@example.com" }),
    ]);
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as RequestError).status).toBe(409);
    }
    expect(await db.person.count({ where: { email: "pat@example.com" } })).toBe(1);
    expect(await pending(family.id)).toEqual([]);
  });
});
