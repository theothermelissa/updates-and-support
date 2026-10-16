import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import noteHandler from "../../api/f/[slug]/notes/[id].js";
import notesHandler from "../../api/f/[slug]/notes/index.js";
import { getDb } from "../../server/db.js";
import { addEmail } from "../../server/gate.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { createNote, deleteNote, listNotes } from "../../server/notes.js";
import { addFamilyMember, changeQuestion, listPeople, setRemoved } from "../../server/people.js";
import { setReaction } from "../../server/reactions.js";
import { createUpdate, deleteUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { answerCorrectly, fakeMailer, joinWithEmail, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The Rivera family (Ana) with supporter Sam and an update, and the Okafor family (Chidi)
// with supporter Olu and an update of their own.
async function setUp() {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const sam = await joinWithEmail(db, family, "Sam");
  const olu = await joinWithEmail(db, okafor, "Olu");
  const update = await createUpdate(db, ana!, { body: "Rivera news" });
  const okaforUpdate = await createUpdate(db, chidi!, { body: "Okafor news" });
  return { family, okafor, ana: ana!, chidi: chidi!, sam: sam.person, samToken: sam.sessionToken, olu, update, okaforUpdate };
}

function leave(person: Person, updateId: string, body = "Thinking of you", extra: Record<string, unknown> = {}) {
  return createNote(db, person, { updateId, body, color: "sky", ...extra });
}

async function feedNotes(person: Person) {
  return (await listUpdates(db, person)).find((u) => u.body === "Rivera news")!.notes;
}

const reload = (p: Person) => db.person.findUniqueOrThrow({ where: { id: p.id } });

describe("family isolation", () => {
  it("treats another family's update as not found, storing nothing", async () => {
    const { olu, update } = await setUp();
    await expect(leave(olu.person, update.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.note.count()).toBe(0);
  });

  it("can't delete another family's note, even as a family member", async () => {
    const { ana, chidi, sam, update } = await setUp();
    const { note } = await leave(sam, update.id);
    await expect(deleteNote(db, chidi, note.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.note.count()).toBe(1);
    await deleteNote(db, ana, note.id);
    expect(await db.note.count()).toBe(0);
  });

  it("shows a family's notes only to that family, on the wall and in the feed", async () => {
    const { ana, sam, olu, update } = await setUp();
    await leave(sam, update.id, "Rivera note");
    expect(await listNotes(db, olu.person)).toEqual([]);
    expect(JSON.stringify(await listUpdates(db, olu.person))).not.toContain("Rivera note");
    expect((await listNotes(db, ana)).map((n) => n.body)).toEqual(["Rivera note"]);
  });

  it("hides a note on this family's update by another family's person", async () => {
    const { ana, olu, update } = await setUp();
    await db.note.create({ data: { updateId: update.id, authorId: olu.person.id, body: "Stray", color: "sky" } });
    expect(await listNotes(db, ana)).toEqual([]);
    expect(await feedNotes(ana)).toEqual([]);
  });

  it("hides a note by this family's person on another family's update", async () => {
    const { ana, sam, okaforUpdate } = await setUp();
    await db.note.create({ data: { updateId: okaforUpdate.id, authorId: sam.id, body: "Stray", color: "sky" } });
    expect(await listNotes(db, ana)).toEqual([]);
    expect(JSON.stringify(await listUpdates(db, ana))).not.toContain("Stray");
  });
});

describe("what each reader sees", () => {
  it("sends names, never IDs or emails, and marks the viewer's own notes and family members' notes", async () => {
    const { ana, sam, update } = await setUp();
    await leave(sam, update.id, "From Sam");
    await leave(ana, update.id, "From Ana");

    const wall = await listNotes(db, sam);
    expect(wall.map((n) => [n.body, n.authorName, n.mine, n.authorIsFamily])).toEqual([
      ["From Ana", "Ana Rivera", false, true],
      ["From Sam", "Sam", true, false],
    ]);
    for (const json of [JSON.stringify(wall), JSON.stringify(await listUpdates(db, sam))]) {
      expect(json).not.toContain(sam.id);
      expect(json).not.toContain(ana.id);
      expect(json).not.toContain(sam.email!);
      expect(json).not.toContain(ana.email!);
    }
  });

  it("lists notes newest first, in the feed and on the wall", async () => {
    const { sam, update } = await setUp();
    await leave(sam, update.id, "First");
    await leave(sam, update.id, "Second");
    expect((await feedNotes(sam)).map((n) => n.body)).toEqual(["Second", "First"]);
    expect((await listNotes(db, sam)).map((n) => n.body)).toEqual(["Second", "First"]);
  });
});

describe("deleting a note", () => {
  it("lets a supporter delete their own note but not someone else's", async () => {
    const { family, sam, update } = await setUp();
    const tess = await joinWithEmail(db, family, "Tess");
    const { note: samsNote } = await leave(sam, update.id);
    const { note: tesssNote } = await leave(tess.person, update.id);

    await expect(deleteNote(db, sam, tesssNote.id)).rejects.toMatchObject({ status: 404 });
    await deleteNote(db, sam, samsNote.id);
    expect((await db.note.findMany()).map((n) => n.id)).toEqual([tesssNote.id]);
  });

  it("lets a family member delete anyone's note", async () => {
    const { ana, sam, update } = await setUp();
    const { note } = await leave(sam, update.id);
    await deleteNote(db, ana, note.id);
    expect(await db.note.count()).toBe(0);
  });

  it("goes with its update when the update is deleted", async () => {
    const { ana, sam, update } = await setUp();
    await leave(sam, update.id);
    await deleteUpdate(db, ana, update.id);
    expect(await db.note.count()).toBe(0);
  });
});

describe("removal", () => {
  it("refuses a removed supporter, whose notes are hidden until restored", async () => {
    const { ana, sam, update } = await setUp();
    await leave(sam, update.id, "Before");
    await setRemoved(db, ana, sam.id, true);

    // Sam's request was authorized before his removal and arrives after it.
    await expect(leave(sam, update.id, "After")).rejects.toMatchObject({ status: 403 });
    expect(await db.note.count()).toBe(1);
    expect(await listNotes(db, ana)).toEqual([]);
    expect(await feedNotes(ana)).toEqual([]);
    // Nor can a family member delete what they can't see.
    const hidden = await db.note.findFirstOrThrow();
    await expect(deleteNote(db, ana, hidden.id)).rejects.toMatchObject({ status: 404 });

    await setRemoved(db, ana, sam.id, false);
    expect((await listNotes(db, ana)).map((n) => n.body)).toEqual(["Before"]);
  });

  it("hides a removed family member's notes until they're added again", async () => {
    const { family, update } = await setUp();
    const { people } = { people: await db.person.findMany({ where: { familyId: family.id, role: "family" } }) };
    const ana = people[0]!;
    await addFamilyMember(db, fakeMailer().send, ana, { name: "Bea Rivera", email: "bea@example.com" });
    const bea = await db.person.findFirstOrThrow({ where: { email: "bea@example.com" } });
    await leave(bea, update.id, "From Bea");

    await setRemoved(db, ana, bea.id, true);
    expect(await listNotes(db, ana)).toEqual([]);

    await addFamilyMember(db, fakeMailer().send, ana, { name: "Bea Rivera", email: "bea@example.com" });
    expect((await listNotes(db, ana)).map((n) => n.body)).toEqual(["From Bea"]);
  });
});

describe("names", () => {
  it("requires a name from a reader without one, and saves it on their record", async () => {
    const { family, ana, update } = await setUp();
    const reader = await answerCorrectly(db, family);
    for (const name of [undefined, "", "   ", "x".repeat(101)]) {
      await expect(leave(reader.person, update.id, "Hi", { name })).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.note.count()).toBe(0);

    const result = await leave(reader.person, update.id, "Hi", { name: " Tess Neighbor " });
    expect(result.name).toBe("Tess Neighbor");
    expect(result.note.authorName).toBe("Tess Neighbor");
    expect((await reload(reader.person)).name).toBe("Tess Neighbor");

    // Their next note needs no name, even from a session that still thinks they have none.
    await leave(reader.person, update.id, "Again");
    expect((await listNotes(db, ana)).map((n) => n.authorName)).toEqual(["Tess Neighbor", "Tess Neighbor"]);
  });

  it("saves a new name from a note and re-signs that person's earlier note and reaction", async () => {
    const { family, ana, update } = await setUp();
    const reader = await answerCorrectly(db, family);
    await setReaction(db, reader.person, { updateId: update.id, kind: "hug" });
    await leave(reader.person, update.id, "Hi", { name: "Tess" });

    const result = await leave(reader.person, update.id, "Again", { name: " Tess Neighbor " });
    expect(result.name).toBe("Tess Neighbor");
    expect(result.note.authorName).toBe("Tess Neighbor");
    expect((await reload(reader.person)).name).toBe("Tess Neighbor");
    expect((await listNotes(db, ana)).map((n) => n.authorName)).toEqual(["Tess Neighbor", "Tess Neighbor"]);
    const feed = (await listUpdates(db, ana)).find((u) => u.id === update.id)!;
    expect(feed.reactions.named).toEqual([{ name: "Tess Neighbor", kind: "hug" }]);
  });

  it("keeps the stored name when a note omits one", async () => {
    const { sam, update } = await setUp();
    const result = await leave(sam, update.id, "Hi", { name: "Mom" });
    expect(result.name).toBe("Mom");
    const again = await leave(sam, update.id, "Again");
    expect(again.name).toBe("Mom");
    expect((await reload(sam)).name).toBe("Mom");
  });

  it("re-signs a note when an email is given under another name, and keeps it when the email omits one", async () => {
    const { family, ana, update } = await setUp();
    const reader = await answerCorrectly(db, family);
    await leave(reader.person, update.id, "Hi", { name: "Tess" });

    await addEmail(db, fakeMailer().send, family, reader.person, { email: "tess@example.com" });
    expect((await reload(reader.person)).name).toBe("Tess");
    expect((await listNotes(db, ana))[0]!.authorName).toBe("Tess");

    const other = await answerCorrectly(db, family);
    await leave(other.person, update.id, "Hello", { name: "Tess" });
    await addEmail(db, fakeMailer().send, family, other.person, { name: "Someone Else", email: "other@example.com" });
    const renamed = await reload(other.person);
    expect([renamed.name, renamed.email]).toEqual(["Someone Else", "other@example.com"]);
    expect((await listNotes(db, ana)).map((n) => n.authorName)).toContain("Someone Else");
  });

  it("names a nameless reader's earlier reaction once they sign a note", async () => {
    const { family, ana, update } = await setUp();
    const reader = await answerCorrectly(db, family);
    await setReaction(db, reader.person, { updateId: update.id, kind: "hug" });
    await leave(reader.person, update.id, "Hi", { name: "Tess" });
    const feed = (await listUpdates(db, ana)).find((u) => u.id === update.id)!;
    expect(feed.reactions.named).toEqual([{ name: "Tess", kind: "hug" }]);
  });
});

describe("flows that keep notes", () => {
  it("keeps a promoted supporter's notes, signed with the name given at promotion", async () => {
    const { ana, sam, update } = await setUp();
    await leave(sam, update.id);
    await addFamilyMember(db, fakeMailer().send, ana, { name: "Sam Rivera", email: sam.email! });
    const promoted = await reload(sam);
    const [note] = await listNotes(db, promoted);
    expect(note).toMatchObject({ authorName: "Sam Rivera", mine: true, authorIsFamily: true });
  });

  it("keeps a nameless author's notes after an answer change signs them out", async () => {
    const { family, ana, update } = await setUp();
    const reader = await answerCorrectly(db, family);
    await leave(reader.person, update.id, "Hi", { name: "Tess" });
    await changeQuestion(db, ana, { question: "What is the cat's name?", answers: ["Mittens"] });

    expect(await db.session.count({ where: { personId: reader.person.id } })).toBe(0);
    expect((await listNotes(db, ana)).map((n) => n.authorName)).toEqual(["Tess"]);
  });

  it("doesn't list a supporter with only a name on the People page", async () => {
    const { family, ana, update } = await setUp();
    const reader = await answerCorrectly(db, family);
    await leave(reader.person, update.id, "Hi", { name: "Tess" });
    expect(JSON.stringify(await listPeople(db, ana))).not.toContain("Tess");
  });
});

describe("validation", () => {
  it("refuses a bad color, a missing update, or an empty or too-long body, storing nothing", async () => {
    const { sam, update } = await setUp();
    for (const color of ["red", "#DCEBF7", "", 3, undefined]) {
      await expect(leave(sam, update.id, "Hi", { color })).rejects.toMatchObject({ status: 400 });
    }
    for (const body of ["", "   \n ", "x".repeat(1001), 42]) {
      await expect(createNote(db, sam, { updateId: update.id, body, color: "sky" })).rejects.toMatchObject({ status: 400 });
    }
    await expect(createNote(db, sam, { body: "Hi", color: "sky" })).rejects.toMatchObject({ status: 400 });
    expect(await db.note.count()).toBe(0);

    await leave(sam, update.id, "x".repeat(1000));
    expect(await db.note.count()).toBe(1);
  });

  it("refuses a 21st note within an hour", async () => {
    const { sam, update } = await setUp();
    for (let i = 0; i < 20; i++) await leave(sam, update.id, `Note ${i}`);
    await expect(leave(sam, update.id, "One more")).rejects.toMatchObject({ status: 429 });

    // Older notes don't count.
    await db.note.updateMany({ data: { createdAt: new Date(Date.now() - 61 * 60 * 1000) } });
    await leave(sam, update.id, "Later");
    expect(await db.note.count()).toBe(21);
  });
});

describe("the notes endpoints", () => {
  const savedUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    // The handlers use getDb, which reads DATABASE_URL on first use.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  });
  afterAll(async () => {
    await getDb().$disconnect();
    process.env.DATABASE_URL = savedUrl;
  });

  type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

  async function call(handler: Handler, method: string, query: Record<string, string>, cookies: Record<string, string>, body?: unknown) {
    const req = { method, query, headers: { "content-type": "application/json" }, cookies, body };
    const res = {
      statusCode: 0,
      setHeader() {},
      appendHeader() {},
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    return res.statusCode;
  }

  it("refuses requests without this family's session, a wrong method, or an unknown family", async () => {
    const { family, olu, sam, samToken, update } = await setUp();
    const { note } = await leave(sam, update.id);
    const slug = family.slug;
    const body = { updateId: update.id, body: "Hi", color: "sky" };
    const samCookie = { [`session_${slug}`]: samToken };
    // Under this family's cookie name, so the handler reads it and the family check refuses it.
    const oluCookie = { [`session_${slug}`]: olu.sessionToken };

    for (const cookies of [{}, oluCookie]) {
      expect(await call(notesHandler, "GET", { slug }, cookies)).toBe(401);
      expect(await call(notesHandler, "POST", { slug }, cookies, body)).toBe(401);
      expect(await call(noteHandler, "DELETE", { slug, id: note.id }, cookies)).toBe(401);
    }
    expect(await call(notesHandler, "PUT", { slug }, samCookie, body)).toBe(405);
    expect(await call(noteHandler, "GET", { slug, id: note.id }, samCookie)).toBe(405);
    expect(await call(notesHandler, "GET", { slug: "no-such-family" }, samCookie)).toBe(404);
    expect(await call(noteHandler, "DELETE", { slug: "no-such-family", id: note.id }, samCookie)).toBe(404);
    expect(await db.note.count()).toBe(1);

    expect(await call(notesHandler, "GET", { slug }, samCookie)).toBe(200);
    expect(await call(notesHandler, "POST", { slug }, samCookie, body)).toBe(200);
    expect(await call(noteHandler, "DELETE", { slug, id: note.id }, samCookie)).toBe(200);
    expect(await db.note.count()).toBe(1);
  });
});
