import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import handler from "../../api/f/[slug]/reactions.js";
import { getDb } from "../../server/db.js";
import { addEmail } from "../../server/gate.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { setRemoved } from "../../server/people.js";
import { createNote, deleteNote, listNotes } from "../../server/notes.js";
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
  await createUpdate(db, chidi!, { body: "Okafor news" });
  return { family, ana: ana!, sam: sam.person, samToken: sam.sessionToken, olu, update };
}

function react(person: Person, updateId: string, kind: unknown = "heart") {
  return setReaction(db, person, { updateId, kind });
}

async function reactionsFor(person: Person) {
  return (await listUpdates(db, person)).find((u) => u.body === "Rivera news")!.reactions;
}

const none = { count: 0, kinds: [], mine: null, named: [] };

describe("who may react, and to what", () => {
  it("treats another family's update as not found", async () => {
    const { olu, update } = await setUp();
    await expect(react(olu.person, update.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.reaction.count()).toBe(0);
  });

  it("refuses a removed supporter, whose earlier reaction is hidden until restored", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id, "hug");
    await setRemoved(db, ana, sam.id, true);

    // Sam's request was authorized before his removal and arrives after it.
    await expect(react(sam, update.id, "clap")).rejects.toMatchObject({ status: 403 });
    expect(await db.reaction.findFirst({ where: { personId: sam.id } })).toMatchObject({ kind: "hug" });
    expect(await reactionsFor(ana)).toEqual(none);

    await setRemoved(db, ana, sam.id, false);
    expect(await reactionsFor(ana)).toEqual({ count: 1, kinds: ["hug"], mine: null, named: [{ name: "Sam", kind: "hug" }] });
  });

  it("rejects an unknown reaction or a missing update, storing nothing", async () => {
    const { sam, update } = await setUp();
    for (const kind of ["thumbsup", "pray", "", 42]) {
      await expect(react(sam, update.id, kind)).rejects.toMatchObject({ status: 400 });
    }
    await expect(setReaction(db, sam, { updateId: update.id })).rejects.toMatchObject({ status: 400 });
    await expect(setReaction(db, sam, { kind: "heart" })).rejects.toMatchObject({ status: 400 });
    expect(await db.reaction.count()).toBe(0);
  });
});

describe("what each reader sees", () => {
  it("shows a family's reactions only with its own updates", async () => {
    const { ana, sam, olu, update } = await setUp();
    await react(sam, update.id);
    await react(ana, update.id, "party");

    const okaforFeed = JSON.stringify(await listUpdates(db, olu.person));
    expect(okaforFeed).not.toContain("Sam");
    expect(okaforFeed).not.toContain("Ana");
  });

  it("filters reactions by family when reading, not only when writing", async () => {
    const { ana, olu, update } = await setUp();
    await db.reaction.create({ data: { updateId: update.id, personId: olu.person.id, kind: "heart" } });
    expect(await reactionsFor(ana)).toEqual(none);
  });

  it("sends names, never IDs or emails", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id);
    const feed = JSON.stringify(await listUpdates(db, ana));
    expect(feed).toContain("Sam");
    expect(feed).not.toContain(sam.id);
    expect(feed).not.toContain(sam.email!);
  });

  it("shows the viewer's own reaction as theirs, and everyone else's by name, most-used emoji first", async () => {
    const { family, ana, sam, update } = await setUp();
    const tess = await joinWithEmail(db, family, "Tess");
    await react(ana, update.id, "hug");
    await react(sam, update.id, "laugh");
    await react(tess.person, update.id, "laugh");

    expect(await reactionsFor(sam)).toEqual({
      count: 3,
      kinds: ["laugh", "hug"],
      mine: "laugh",
      named: [
        { name: "Ana Rivera", kind: "hug" },
        { name: "Tess", kind: "laugh" },
      ],
    });
  });

  it("counts a nameless reader without naming them, and names them once they give a name", async () => {
    const { family, ana, update } = await setUp();
    const reader = await answerCorrectly(db, family);
    await react(reader.person, update.id, "hug");
    expect(await reactionsFor(ana)).toEqual({ count: 1, kinds: ["hug"], mine: null, named: [] });

    await addEmail(db, fakeMailer().send, family, reader.person, { name: "Tess Neighbor", email: "tess@example.com" });
    expect((await reactionsFor(ana)).named).toEqual([{ name: "Tess Neighbor", kind: "hug" }]);
  });
});

describe("setting a reaction", () => {
  it("keeps one per person, replaces it with another, and clears it, each idempotently", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id, "heart");
    await react(sam, update.id, "heart");
    expect(await db.reaction.count()).toBe(1);

    await react(sam, update.id, "clap");
    expect(await db.reaction.count()).toBe(1);
    expect(await reactionsFor(ana)).toMatchObject({ count: 1, kinds: ["clap"], named: [{ name: "Sam", kind: "clap" }] });

    await react(sam, update.id, null);
    await react(sam, update.id, null);
    expect(await db.reaction.count()).toBe(0);
  });

  it("goes with its update when the update is deleted", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id);
    await deleteUpdate(db, ana, update.id);
    expect(await db.reaction.count()).toBe(0);
  });
});

async function leaveNote(person: Person, updateId: string) {
  const { note } = await createNote(db, person, { updateId, body: "With you", color: "sky" });
  return note;
}

function reactToNote(person: Person, noteId: string, kind: unknown = "heart") {
  return setReaction(db, person, { noteId, kind });
}

async function noteReactionsFor(person: Person, noteId: string) {
  return (await listNotes(db, person)).find((n) => n.id === noteId)!.reactions;
}

describe("reactions on notes", () => {
  it("treats another family's note, or a removed author's note, as not found", async () => {
    const { ana, sam, olu, update } = await setUp();
    const note = await leaveNote(sam, update.id);
    await expect(reactToNote(olu.person, note.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.noteReaction.count()).toBe(0);

    await reactToNote(ana, note.id, "heart");
    await setRemoved(db, ana, sam.id, true);
    await expect(reactToNote(ana, note.id, "clap")).rejects.toMatchObject({ status: 404 });
    expect(await db.noteReaction.findFirst({ where: { noteId: note.id } })).toMatchObject({ kind: "heart" });
    expect(await listNotes(db, ana)).toEqual([]);

    await setRemoved(db, ana, sam.id, false);
    expect(await noteReactionsFor(ana, note.id)).toEqual({ count: 1, kinds: ["heart"], mine: "heart", named: [] });
  });

  it("refuses a removed supporter, whose earlier reaction is hidden until restored", async () => {
    const { ana, sam, update } = await setUp();
    const note = await leaveNote(ana, update.id);
    await reactToNote(sam, note.id, "hug");
    await setRemoved(db, ana, sam.id, true);

    await expect(reactToNote(sam, note.id, "clap")).rejects.toMatchObject({ status: 403 });
    expect(await db.noteReaction.findFirst({ where: { personId: sam.id } })).toMatchObject({ kind: "hug" });
    expect(await noteReactionsFor(ana, note.id)).toEqual(none);

    await setRemoved(db, ana, sam.id, false);
    expect(await noteReactionsFor(ana, note.id)).toEqual({
      count: 1,
      kinds: ["hug"],
      mine: null,
      named: [{ name: "Sam", kind: "hug" }],
    });
  });

  it("rejects an unknown reaction, both targets, or a missing note, storing nothing", async () => {
    const { sam, update } = await setUp();
    const note = await leaveNote(sam, update.id);
    for (const kind of ["thumbsup", "pray", "", 42]) {
      await expect(reactToNote(sam, note.id, kind)).rejects.toMatchObject({ status: 400 });
    }
    await expect(setReaction(db, sam, { noteId: note.id })).rejects.toMatchObject({ status: 400 });
    await expect(setReaction(db, sam, { updateId: update.id, noteId: note.id, kind: "heart" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(reactToNote(sam, "no-such-note")).rejects.toMatchObject({ status: 404 });
    expect(await db.noteReaction.count()).toBe(0);
    expect(await db.reaction.count()).toBe(0);
  });

  it("filters reactions by family when reading, on the wall and on the feed", async () => {
    const { ana, olu, update } = await setUp();
    const note = await leaveNote(ana, update.id);
    await db.noteReaction.create({ data: { noteId: note.id, personId: olu.person.id, kind: "clap" } });

    expect(await noteReactionsFor(ana, note.id)).toEqual(none);
    const feed = (await listUpdates(db, ana)).find((u) => u.id === update.id)!;
    expect(feed.notes[0]!.reactions).toEqual(none);
    expect(JSON.stringify(feed)).not.toContain(olu.person.id);
  });

  it("sends names, never IDs or emails, and agrees on the wall and the feed", async () => {
    const { family, ana, sam, update } = await setUp();
    const tess = await joinWithEmail(db, family, "Tess");
    const note = await leaveNote(ana, update.id);
    await reactToNote(ana, note.id, "heart");
    await reactToNote(sam, note.id, "clap");
    await reactToNote(tess.person, note.id, "clap");

    const seen = {
      count: 3,
      kinds: ["clap", "heart"],
      mine: "heart",
      named: [
        { name: "Sam", kind: "clap" },
        { name: "Tess", kind: "clap" },
      ],
    };
    expect(await noteReactionsFor(ana, note.id)).toEqual(seen);
    const feed = (await listUpdates(db, ana)).find((u) => u.id === update.id)!;
    expect(feed.notes[0]!.reactions).toEqual(seen);
    expect(feed.reactions).toEqual(none);

    const wall = JSON.stringify(await listNotes(db, ana));
    expect(wall).toContain("Sam");
    expect(wall).not.toContain(sam.id);
    expect(wall).not.toContain(sam.email!);
    const serialized = JSON.stringify(feed);
    expect(serialized).not.toContain(sam.id);
    expect(serialized).not.toContain(sam.email!);
  });

  it("counts a nameless reader without naming them, and names them once they give a name", async () => {
    const { family, ana, update } = await setUp();
    const note = await leaveNote(ana, update.id);
    const reader = await answerCorrectly(db, family);
    await reactToNote(reader.person, note.id, "hug");
    expect(await noteReactionsFor(ana, note.id)).toEqual({ count: 1, kinds: ["hug"], mine: null, named: [] });

    await addEmail(db, fakeMailer().send, family, reader.person, { name: "Tess Neighbor", email: "tess@example.com" });
    expect((await noteReactionsFor(ana, note.id)).named).toEqual([{ name: "Tess Neighbor", kind: "hug" }]);
  });

  it("keeps one per person, replaces it with another, and clears it, each idempotently", async () => {
    const { ana, sam, update } = await setUp();
    const note = await leaveNote(ana, update.id);
    await reactToNote(sam, note.id, "heart");
    await reactToNote(sam, note.id, "heart");
    expect(await db.noteReaction.count()).toBe(1);

    await reactToNote(sam, note.id, "clap");
    expect(await db.noteReaction.count()).toBe(1);
    expect(await noteReactionsFor(ana, note.id)).toMatchObject({ count: 1, kinds: ["clap"] });

    await reactToNote(sam, note.id, null);
    await reactToNote(sam, note.id, null);
    expect(await db.noteReaction.count()).toBe(0);
  });

  it("goes away when the note or its update is deleted", async () => {
    const { ana, sam, update } = await setUp();
    const note = await leaveNote(ana, update.id);
    const other = await leaveNote(ana, update.id);
    await reactToNote(sam, note.id);
    await reactToNote(sam, other.id, "clap");

    await deleteNote(db, ana, note.id);
    expect(await db.noteReaction.count()).toBe(1);

    await deleteUpdate(db, ana, update.id);
    expect(await db.noteReaction.count()).toBe(0);
  });
});

describe("the reactions endpoint", () => {
  const savedUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    // The handler uses getDb, which reads DATABASE_URL on first use.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  });
  afterAll(async () => {
    await getDb().$disconnect();
    process.env.DATABASE_URL = savedUrl;
  });

  async function post(slug: string, cookies: Record<string, string>, body: unknown) {
    const req = { method: "POST", query: { slug }, headers: { "content-type": "application/json" }, cookies, body };
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

  it("refuses a request without this family's session, storing nothing", async () => {
    const { family, olu, samToken, update } = await setUp();
    const body = { updateId: update.id, kind: "heart" };

    expect(await post(family.slug, {}, body)).toBe(401);
    // Under this family's cookie name, so the handler reads it and the family check refuses it.
    expect(await post(family.slug, { [`session_${family.slug}`]: olu.sessionToken }, body)).toBe(401);
    expect(await db.reaction.count()).toBe(0);

    expect(await post(family.slug, { [`session_${family.slug}`]: samToken }, body)).toBe(200);
    expect(await db.reaction.count()).toBe(1);
  });

  it("refuses a note reaction without this family's session, storing nothing", async () => {
    const { family, ana, olu, samToken, update } = await setUp();
    const note = await leaveNote(ana, update.id);
    const body = { noteId: note.id, kind: "clap" };

    expect(await post(family.slug, {}, body)).toBe(401);
    expect(await post(family.slug, { [`session_${family.slug}`]: olu.sessionToken }, body)).toBe(401);
    expect(await db.noteReaction.count()).toBe(0);

    expect(await post(family.slug, { [`session_${family.slug}`]: samToken }, body)).toBe(200);
    expect(await db.noteReaction.count()).toBe(1);
  });
});
