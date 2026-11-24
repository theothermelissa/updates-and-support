import type { Db } from "../../server/db.js";
import type { Email, SendEmail, SendEmails } from "../../server/email.js";
import { createFamily } from "../../server/families.js";
import { addEmail, answerGate, type Client } from "../../server/gate.js";
import { addFamilyMember, addSupporter, listPeople, verifySupporter } from "../../server/people.js";
import type { Family, Person } from "../../server/generated/prisma/client.js";
import type { VideoStore } from "../../server/videos.js";

export async function resetDb(db: Db) {
  await db.$executeRawUnsafe(
    `TRUNCATE "GateAttempt", "Update", "Session", "MagicLink", "Person", "Family" CASCADE`,
  );
}

// A family of fictional family members, named after the given surname. An invite-only one has
// no question.
export async function makeFamily(db: Db, surname: string, firstNames = ["Ana"], { inviteOnly = false } = {}) {
  const family = await createFamily(db, {
    displayName: `The ${surname} Family`,
    inviteOnly,
    question: "What is the dog's name?",
    acceptedAnswers: ["Biscuit"],
    members: firstNames.map((first) => ({
      name: `${first} ${surname}`,
      email: `${first}.${surname}@example.com`.toLowerCase(),
    })),
  });
  const people = await db.person.findMany({ where: { familyId: family.id }, orderBy: { name: "asc" } });
  return { family, people };
}

// A family member without admin rights, such as "ben@example.com" for "Ben", added through the
// real add form.
export async function makeNonAdmin(db: Db, family: Family, name: string) {
  const admin = await db.person.findFirstOrThrow({
    where: { familyId: family.id, role: "family", isAdmin: true, removedAt: null },
  });
  const email = `${name.toLowerCase()}@example.com`;
  await addFamilyMember(db, fakeMailer().send, admin, { name, email, admin: false });
  return db.person.findUniqueOrThrow({ where: { familyId_email: { familyId: family.id, email } } });
}

// The People page as an admin sees it. Throws if the person isn't one.
export async function listAdminPeople(db: Db, person: Person) {
  const people = await listPeople(db, person);
  if (!people.admin) throw new Error("Expected the admin People page");
  return people;
}

// Answers makeFamily's question correctly, as a new reader with no name or email. Returns
// them and their session token.
export async function answerCorrectly(
  db: Db,
  family: Family,
  client: Client = { browserId: "browser-a", network: "203.0.113.1" },
) {
  const result = await answerGate(db, family, client, { answer: "Biscuit" });
  if (result.result !== "joined") throw new Error(`Expected to join, got ${result.result}`);
  return { person: result.person, sessionToken: result.sessionToken };
}

// A reader who has also given their name and an unverified email, such as "sam@example.com"
// for "Sam". Returns them, their session token, and the emails sent.
export async function joinWithEmail(db: Db, family: Family, name: string, send?: SendEmail) {
  const reader = await answerCorrectly(db, family);
  const email = `${name.toLowerCase()}@example.com`;
  const mail = fakeMailer();
  await addEmail(db, send ?? mail.send, family, reader.person, { name, email });
  const person = await db.person.findUniqueOrThrow({ where: { id: reader.person.id } });
  return { person, sessionToken: reader.sessionToken, email, sent: mail.sent };
}

// A reader who has given their name and email, such as "gia@example.com" for "Gia", and had it
// verified by one of the family's family members. Group tests use these, since an unverified
// member sees nothing of a group.
export async function verifiedSupporter(db: Db, family: Family, name: string) {
  const { person } = await joinWithEmail(db, family, name);
  const member = await db.person.findFirstOrThrow({ where: { familyId: family.id, role: "family", removedAt: null } });
  await verifySupporter(db, member, person.id, true);
  return db.person.findUniqueOrThrow({ where: { id: person.id } });
}

// A supporter a family member added by email, such as "gia@example.com" for "Gia", with their
// email verified by that family member. The only way into an invite-only family.
export async function addedSupporter(db: Db, family: Family, name: string) {
  const member = await db.person.findFirstOrThrow({ where: { familyId: family.id, role: "family", removedAt: null } });
  const email = `${name.toLowerCase()}@example.com`;
  await addSupporter(db, fakeMailer().send, member, { name, email });
  const person = await db.person.findUniqueOrThrow({ where: { familyId_email: { familyId: family.id, email } } });
  await verifySupporter(db, member, person.id, true);
  return db.person.findUniqueOrThrow({ where: { id: person.id } });
}

// A group with these people in it, inserted directly: tests create groups without the
// People page's checks.
export async function makeGroup(db: Db, familyId: string, name: string, memberIds: string[] = []) {
  return db.group.create({
    data: { familyId, name, members: { create: memberIds.map((personId) => ({ personId })) } },
  });
}

// Waits until a transaction is queued on an advisory lock, such as a family's gate lock, or
// the given work has finished without queuing. Pass "transactionid" to wait on a row lock instead,
// or a list to wait on any of them. Tests use it to start work while holding a lock themselves, so
// a race plays out the same way every time.
export async function queuedOrDone(db: Db, work: Promise<unknown>, locktype: string | string[] = "advisory") {
  const locktypes = Array.isArray(locktype) ? locktype : [locktype];
  let done = false;
  work.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 400 && !done; i++) {
    const [row] = await db.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = ANY(${locktypes}) AND NOT granted`;
    if (row!.waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// A mailer that records what it was asked to send.
export function fakeMailer() {
  const sent: Email[] = [];
  const send: SendEmail = async (email) => {
    sent.push(email);
  };
  const sendMany: SendEmails = async (emails) => {
    sent.push(...emails);
  };
  return { sent, send, sendMany };
}

export function tokenFrom(email: Email): string {
  const match = email.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("No token in email");
  return match[1]!;
}

// A video host that records what it was asked. `videos` holds what's "uploaded" as an
// authenticated video, by public ID, with its length in seconds. `holdDestroy` makes the next
// destroy wait until `release` is called, so a test can act while a deletion is underway.
export function fakeVideoStore() {
  const videos = new Map<string, number>();
  const sizes = new Map<string, number>();
  const calls: { method: keyof VideoStore; publicIds: string[] }[] = [];
  let failDestroy = false;
  // Every call that needs the host's configuration fails, as with a malformed CLOUDINARY_URL.
  let misconfigured = false;
  let hold: Promise<void> | null = null;
  let release = () => {};
  const store: VideoStore = {
    uploadParams(publicId) {
      calls.push({ method: "uploadParams", publicIds: [publicId] });
      if (misconfigured) throw new Error("Video host misconfigured");
      return { url: "https://upload.example.test/video/upload", fields: { public_id: publicId } };
    },
    async describe(publicId) {
      calls.push({ method: "describe", publicIds: [publicId] });
      if (misconfigured) throw new Error("Video host misconfigured");
      const duration = videos.get(publicId);
      return duration === undefined ? null : { duration, bytes: sizes.get(publicId) ?? 1_000_000 };
    },
    async destroy(publicIds) {
      calls.push({ method: "destroy", publicIds });
      if (hold) await hold;
      if (failDestroy) throw new Error("Video host unavailable");
      for (const id of publicIds) videos.delete(id);
    },
    urls(publicId) {
      if (misconfigured) throw new Error("Video host misconfigured");
      return { src: `https://videos.example.test/${publicId}.mp4`, poster: `https://videos.example.test/${publicId}.jpg` };
    },
  };
  return {
    store,
    videos,
    calls,
    setBytes: (publicId: string, bytes: number) => sizes.set(publicId, bytes),
    failDestroy: (fail: boolean) => (failDestroy = fail),
    misconfigure: (on: boolean) => (misconfigured = on),
    holdDestroy() {
      hold = new Promise((resolve) => (release = resolve));
      return () => release();
    },
  };
}
