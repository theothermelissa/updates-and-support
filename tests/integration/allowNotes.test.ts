import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Person } from "../../server/generated/prisma/client.js";
import { createNote, deleteNote, setAllowNotesByDefault } from "../../server/notes.js";
import { listPeople } from "../../server/people.js";
import { setReaction } from "../../server/reactions.js";
import { createUpdate, editUpdate, listUpdates, newUpdateDefaults } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { joinWithEmail, makeFamily, queuedOrDone, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The Rivera family (Ana) with supporter Sam, and the Okafor family (Chidi).
async function setUp() {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const sam = await joinWithEmail(db, family, "Sam");
  return { family, okafor, ana: ana!, chidi: chidi!, sam: sam.person };
}

function leave(person: Person, updateId: string) {
  return createNote(db, person, { updateId, body: "Thinking of you", color: "sky" });
}

const allowNotesOf = async (id: string) => (await db.update.findUniqueOrThrow({ where: { id } })).allowNotes;

describe("an update that doesn't allow notes", () => {
  it("refuses a new note, storing nothing, while one that allows notes takes it", async () => {
    const { ana, sam } = await setUp();
    const closed = await createUpdate(db, ana, { body: "Quiet day", allowNotes: false });
    const open = await createUpdate(db, ana, { body: "Good news", allowNotes: true });
    await expect(leave(sam, closed.id)).rejects.toMatchObject({ status: 403 });
    await expect(leave(ana, closed.id)).rejects.toMatchObject({ status: 403 });
    expect(await db.note.count()).toBe(0);
    await leave(sam, open.id);
    expect(await db.note.count()).toBe(1);
  });

  it("keeps its notes reactable and deletable once notes are turned off", async () => {
    const { ana, sam } = await setUp();
    const update = await createUpdate(db, ana, { body: "News" });
    const { note: first } = await leave(sam, update.id);
    const { note: second } = await leave(sam, update.id);
    await editUpdate(db, ana, update.id, { body: "News", allowNotes: false });

    await setReaction(db, ana, { noteId: first.id, kind: "heart" });
    expect(await db.noteReaction.count()).toBe(1);
    await deleteNote(db, sam, first.id);
    await deleteNote(db, ana, second.id);
    expect(await db.note.count()).toBe(0);
  });

  it("refuses a note that was waiting while an edit turned notes off", async () => {
    const { ana, sam } = await setUp();
    const update = await createUpdate(db, ana, { body: "News" });

    // Holds the update's row lock, as editUpdate does, and turns notes off; the note starts
    // meanwhile and must see the change once this commits.
    let leaving!: Promise<unknown>;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Update" WHERE id = ${update.id} FOR UPDATE`;
      await tx.update.update({ where: { id: update.id }, data: { allowNotes: false } });
      leaving = leave(sam, update.id);
      await queuedOrDone(db, leaving, "transactionid");
    });

    await expect(leaving).rejects.toMatchObject({ status: 403 });
    expect(await db.note.count()).toBe(0);
  });
});

describe("posting and editing", () => {
  it("takes the family's default when the post doesn't say, for text and video", async () => {
    const { ana, family } = await setUp();
    expect(await allowNotesOf((await createUpdate(db, ana, { body: "Before" })).id)).toBe(true);
    await db.family.update({ where: { id: family.id }, data: { allowNotesByDefault: false } });
    expect(await allowNotesOf((await createUpdate(db, ana, { body: "After" })).id)).toBe(false);
    expect(await allowNotesOf((await createUpdate(db, ana, { body: "Chosen", allowNotes: true })).id)).toBe(true);
  });

  it("uses the poster's own family's default, not another family's", async () => {
    const { ana, okafor } = await setUp();
    await db.family.update({ where: { id: okafor.id }, data: { allowNotesByDefault: false } });
    expect(await allowNotesOf((await createUpdate(db, ana, { body: "Rivera news" })).id)).toBe(true);
  });

  it("refuses an allowNotes that isn't true or false", async () => {
    const { ana } = await setUp();
    await expect(createUpdate(db, ana, { body: "News", allowNotes: "no" })).rejects.toMatchObject({ status: 400 });
    expect(await db.update.count()).toBe(0);
  });

  it("changes allowNotes on edit only when the edit says so, and shows it in the feed", async () => {
    const { ana, sam } = await setUp();
    const update = await createUpdate(db, ana, { body: "News" });
    await editUpdate(db, ana, update.id, { body: "News, edited", allowNotes: false });
    expect(await allowNotesOf(update.id)).toBe(false);
    await editUpdate(db, ana, update.id, { body: "News, edited again" });
    expect(await allowNotesOf(update.id)).toBe(false);
    expect((await listUpdates(db, sam))[0]).toMatchObject({ allowNotes: false });
  });
});

describe("the family's default", () => {
  it("can be changed only by a family member, and only for their own family", async () => {
    const { ana, sam, family, okafor } = await setUp();
    await expect(setAllowNotesByDefault(db, sam, { allowNotesByDefault: false })).rejects.toMatchObject({ status: 403 });
    expect((await db.family.findUniqueOrThrow({ where: { id: family.id } })).allowNotesByDefault).toBe(true);

    expect(await setAllowNotesByDefault(db, ana, { allowNotesByDefault: false })).toEqual({ allowNotesByDefault: false });
    expect((await db.family.findUniqueOrThrow({ where: { id: family.id } })).allowNotesByDefault).toBe(false);
    expect((await db.family.findUniqueOrThrow({ where: { id: okafor.id } })).allowNotesByDefault).toBe(true);
    expect((await listPeople(db, ana)).allowNotesByDefault).toBe(false);
  });

  it("refuses a value that isn't true or false", async () => {
    const { ana } = await setUp();
    await expect(setAllowNotesByDefault(db, ana, { allowNotesByDefault: "off" })).rejects.toMatchObject({ status: 400 });
  });

  it("is sent with the feed to family members only", async () => {
    const { ana, sam, family } = await setUp();
    await db.family.update({ where: { id: family.id }, data: { allowNotesByDefault: false } });
    expect(await newUpdateDefaults(db, ana)).toEqual({ allowNotesByDefault: false });
    expect(await newUpdateDefaults(db, sam)).toBeNull();
  });
});
