import type { Db } from "../../server/db.js";
import type { Email, SendEmail, SendEmails } from "../../server/email.js";
import { createFamily } from "../../server/families.js";
import { addEmail, answerGate, type Client } from "../../server/gate.js";
import type { Family } from "../../server/generated/prisma/client.js";
import type { VideoStore } from "../../server/videos.js";

export async function resetDb(db: Db) {
  await db.$executeRawUnsafe(
    `TRUNCATE "GateAttempt", "Update", "Session", "MagicLink", "Person", "Family" CASCADE`,
  );
}

// A family of fictional family members, named after the given surname.
export async function makeFamily(db: Db, surname: string, firstNames = ["Ana"]) {
  const family = await createFamily(db, {
    displayName: `The ${surname} Family`,
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

// Waits until a transaction is queued on an advisory lock, such as a family's gate lock, or
// the given work has finished without queuing. Pass "transactionid" to wait on a row lock instead. Tests use it to start work while holding a
// lock themselves, so a race plays out the same way every time.
export async function queuedOrDone(db: Db, work: Promise<unknown>, locktype = "advisory") {
  let done = false;
  work.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 400 && !done; i++) {
    const [row] = await db.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = ${locktype} AND NOT granted`;
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
  const calls: { method: keyof VideoStore; publicIds: string[] }[] = [];
  let failDestroy = false;
  let failUrls = false;
  let hold: Promise<void> | null = null;
  let release = () => {};
  const store: VideoStore = {
    uploadParams(publicId) {
      calls.push({ method: "uploadParams", publicIds: [publicId] });
      return { url: "https://upload.example.test/video/upload", fields: { public_id: publicId } };
    },
    async describe(publicId) {
      calls.push({ method: "describe", publicIds: [publicId] });
      const duration = videos.get(publicId);
      return duration === undefined ? null : { duration };
    },
    async destroy(publicIds) {
      calls.push({ method: "destroy", publicIds });
      if (hold) await hold;
      if (failDestroy) throw new Error("Video host unavailable");
      for (const id of publicIds) videos.delete(id);
    },
    urls(publicId) {
      if (failUrls) throw new Error("Video host misconfigured");
      return { src: `https://videos.example.test/${publicId}.mp4`, poster: `https://videos.example.test/${publicId}.jpg` };
    },
  };
  return {
    store,
    videos,
    calls,
    failDestroy: (fail: boolean) => (failDestroy = fail),
    failUrls: (fail: boolean) => (failUrls = fail),
    holdDestroy() {
      hold = new Promise((resolve) => (release = resolve));
      return () => release();
    },
  };
}
