import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import handler from "../../api/f/[slug]/reactions.js";
import { getDb } from "../../server/db.js";
import { addEmail } from "../../server/gate.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { setRemoved } from "../../server/people.js";
import { createNote, deleteNote, listNotes } from "../../server/notes.js";
import { setReaction } from "../../server/reactions.js";
import { createUpdate, deleteUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { USUAL_REACTIONS } from "../../src/lib/reactionCatalog.js";
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

const usual = [...USUAL_REACTIONS];
const none = { count: 0, kinds: [], mine: null, allowed: usual, named: [] };

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
    expect(await reactionsFor(ana)).toEqual({ count: 1, kinds: ["hug"], mine: null, allowed: usual, named: [{ name: "Sam", kind: "hug" }] });
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

// A document of one paragraph, as the editor sends it.
function doc(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

describe("each update's own set", () => {
  it("accepts only reactions in the update's set, storing nothing for the rest", async () => {
    const { ana, sam } = await setUp();
    const update = await createUpdate(db, ana, { body: "Rough day", reactions: ["middle_finger", "skull", "heart"] });

    await react(sam, update.id, "skull");
    for (const kind of ["hug", "laugh", "pray"]) {
      await expect(react(ana, update.id, kind)).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.reaction.findMany({ select: { kind: true, personId: true } })).toEqual([{ kind: "skull", personId: sam.id }]);
    const shown = (await listUpdates(db, sam)).find((u) => u.id === update.id)!.reactions;
    expect(shown).toMatchObject({ kinds: ["skull"], mine: "skull", allowed: ["heart", "middle_finger", "skull"] });
  });

  it("refuses every reaction on an update that allows none", async () => {
    const { ana, sam } = await setUp();
    const update = await createUpdate(db, ana, { body: "No reactions, please", reactions: [] });
    for (const kind of ["heart", "skull"]) {
      await expect(react(sam, update.id, kind)).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.reaction.count()).toBe(0);
    expect((await listUpdates(db, sam)).find((u) => u.id === update.id)!.reactions.allowed).toEqual([]);
  });

  it("keeps a reaction the set drops, which its owner can clear but no one can pick again", async () => {
    const { ana, sam, family } = await setUp();
    const tess = (await joinWithEmail(db, family, "Tess")).person;
    const update = await createUpdate(db, ana, { content: doc("Scan day") });
    await react(sam, update.id, "laugh");

    await editUpdate(db, ana, update.id, { content: doc("Scan day"), reactions: ["heart", "pray"] });
    const shown = (await listUpdates(db, ana)).find((u) => u.id === update.id)!.reactions;
    expect(shown).toMatchObject({ count: 1, kinds: ["laugh"], allowed: ["heart", "pray"], named: [{ name: "Sam", kind: "laugh" }] });

    await expect(react(tess, update.id, "laugh")).rejects.toMatchObject({ status: 400 });
    await react(sam, update.id, "heart");
    await expect(react(sam, update.id, "laugh")).rejects.toMatchObject({ status: 400 });
    expect(await db.reaction.findFirst({ where: { personId: sam.id } })).toMatchObject({ kind: "heart" });

    await editUpdate(db, ana, update.id, { content: doc("Scan day"), reactions: [] });
    await react(sam, update.id, null);
    expect(await db.reaction.count()).toBe(0);
  });

  it("stores the set in catalog order, and refuses one that isn't a set of at most six catalog emoji", async () => {
    const { ana } = await setUp();
    const update = await createUpdate(db, ana, { content: doc("Ordered"), reactions: ["skull", "pray", "heart"] });
    expect(await db.update.findUniqueOrThrow({ where: { id: update.id } })).toMatchObject({
      reactionKinds: ["heart", "pray", "skull"],
    });

    const bad: unknown[] = [
      ["heart", "hug", "strong", "clap", "party", "laugh", "skull"],
      ["heart", "heart"],
      ["thumbsup"],
      [42],
      "heart",
      null,
    ];
    for (const reactions of bad) {
      await expect(createUpdate(db, ana, { content: doc("Bad"), reactions })).rejects.toMatchObject({ status: 400 });
      await expect(editUpdate(db, ana, update.id, { content: doc("Changed"), reactions })).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(await db.update.count({ where: { body: "Bad" } })).toBe(0);
    expect(await db.update.findUniqueOrThrow({ where: { id: update.id } })).toMatchObject({
      body: "Ordered",
      reactionKinds: ["heart", "pray", "skull"],
      editedAt: null,
    });
  });

  it("gives a new update the usual six, and leaves the set alone on an edit that doesn't send one", async () => {
    const { ana, update } = await setUp();
    expect(await db.update.findUniqueOrThrow({ where: { id: update.id } })).toMatchObject({ reactionKinds: usual });
    const custom = await createUpdate(db, ana, { content: doc("Custom"), reactions: ["sunflower"] });
    await editUpdate(db, ana, custom.id, { content: doc("Custom, edited") });
    expect(await db.update.findUniqueOrThrow({ where: { id: custom.id } })).toMatchObject({ reactionKinds: ["sunflower"] });
  });

  it("refuses a supporter's edit that changes the set", async () => {
    const { ana, sam } = await setUp();
    const update = await createUpdate(db, ana, { content: doc("Family only") });
    await expect(
      editUpdate(db, sam, update.id, { content: doc("Family only"), reactions: ["middle_finger"] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db.update.findUniqueOrThrow({ where: { id: update.id } })).toMatchObject({ reactionKinds: usual });
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
      allowed: usual,
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
    expect(await reactionsFor(ana)).toEqual({ count: 1, kinds: ["hug"], mine: null, allowed: usual, named: [] });

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
  it("refuses a note that fails only one of the two family checks", async () => {
    const { ana, sam, olu, update } = await setUp();
    const onRiveraByOlu = await db.note.create({
      data: { updateId: update.id, authorId: olu.person.id, body: "Stray", color: "sky" },
    });
    const okaforUpdate = await db.update.findFirstOrThrow({ where: { familyId: olu.person.familyId } });
    const onOkaforBySam = await db.note.create({
      data: { updateId: okaforUpdate.id, authorId: sam.id, body: "Stray", color: "sky" },
    });

    await expect(reactToNote(ana, onRiveraByOlu.id)).rejects.toMatchObject({ status: 404 });
    await expect(reactToNote(ana, onOkaforBySam.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.noteReaction.count()).toBe(0);
  });

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
    expect(await noteReactionsFor(ana, note.id)).toEqual({ count: 1, kinds: ["heart"], mine: "heart", allowed: usual, named: [] });
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
      allowed: usual,
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

  it("allows only the usual six on a note, whatever its update allows", async () => {
    const { ana, sam } = await setUp();
    const update = await createUpdate(db, ana, { body: "Custom", reactions: ["skull", "pray"] });
    const note = await leaveNote(sam, update.id);
    for (const kind of ["skull", "pray", "sunflower"]) {
      await expect(reactToNote(ana, note.id, kind)).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.noteReaction.count()).toBe(0);
    await reactToNote(ana, note.id, "hug");
    expect((await noteReactionsFor(ana, note.id)).allowed).toEqual(usual);
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
      allowed: usual,
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
    expect(await noteReactionsFor(ana, note.id)).toEqual({ count: 1, kinds: ["hug"], mine: null, allowed: usual, named: [] });

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
