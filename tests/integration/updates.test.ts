import { afterAll, beforeEach, expect, it } from "vitest";
import { RequestError } from "../../server/errors.js";
import { createUpdate, deleteUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const text = (...texts: string[]) => ({ blocks: texts.map((t) => ({ type: "text", text: t })) });
const texts = (update: { blocks: { text: string }[] }) => update.blocks.map((b) => b.text);

it("lists only the person's own family's updates", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const { people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  await createUpdate(db, ana!, text("Rivera news"));
  await createUpdate(db, chidi!, text("Okafor news"));

  expect((await listUpdates(db, ana!)).map(texts)).toEqual([["Rivera news"]]);
});

it("refuses to edit or delete another family's update by ID, leaving it unchanged", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const { people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const theirs = await createUpdate(db, chidi!, text("Okafor news", "More"));

  await expect(editUpdate(db, ana!, theirs.id, text("hijacked"))).rejects.toMatchObject({ status: 404 });
  await expect(deleteUpdate(db, ana!, theirs.id)).rejects.toMatchObject({ status: 404 });
  const stored = await db.update.findUniqueOrThrow({
    where: { id: theirs.id },
    include: { blocks: { orderBy: { position: "asc" } } },
  });
  expect(stored.body).toBe("Okafor news\n\nMore");
  expect(stored.blocks.map((b) => b.text)).toEqual(["Okafor news", "More"]);
  expect(stored.editedAt).toBeNull();
});

it("lets a supporter read but not create, edit, or delete", async () => {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const supporter = await db.person.create({
    data: { familyId: family.id, role: "supporter", name: "Sam Friend", email: "sam@example.com" },
  });
  const update = await createUpdate(db, ana!, text("Rivera news"));

  expect(await listUpdates(db, supporter)).toHaveLength(1);
  await expect(createUpdate(db, supporter, text("nope"))).rejects.toMatchObject({ status: 403 });
  await expect(editUpdate(db, supporter, update.id, text("nope"))).rejects.toMatchObject({ status: 403 });
  await expect(deleteUpdate(db, supporter, update.id)).rejects.toMatchObject({ status: 403 });
  expect(await db.update.count()).toBe(1);
  expect(await db.block.findMany({ select: { text: true } })).toEqual([{ text: "Rivera news" }]);
});

it("keeps blocks in order and the body in step, and replaces them all on edit", async () => {
  const { people: [ana, luis] } = await makeFamily(db, "Rivera", ["Ana", "Luis"]);
  const update = await createUpdate(db, ana!, text(" First ", "Second", "Third"));
  expect(texts(update)).toEqual(["First", "Second", "Third"]);

  const edited = await editUpdate(db, luis!, update.id, text("Only"));
  expect(edited).toMatchObject({ blocks: [{ type: "text", text: "Only" }], authorName: "Ana Rivera" });
  expect(edited.editedAt).toBeInstanceOf(Date);
  const stored = await db.update.findUniqueOrThrow({ where: { id: update.id }, include: { blocks: true } });
  expect(stored.body).toBe("Only");
  expect(stored.blocks).toHaveLength(1);

  await editUpdate(db, luis!, update.id, text("One", "Two"));
  expect((await listUpdates(db, ana!)).map(texts)).toEqual([["One", "Two"]]);
  expect((await db.update.findUniqueOrThrow({ where: { id: update.id } })).body).toBe("One\n\nTwo");

  await deleteUpdate(db, luis!, update.id);
  expect(await db.update.count()).toBe(0);
  expect(await db.block.count()).toBe(0);
});

it("still accepts a body from pages loaded before blocks, and blocks win when both are sent", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const fromBody = await createUpdate(db, ana!, { body: "Old page" });
  expect(texts(fromBody)).toEqual(["Old page"]);

  const both = await createUpdate(db, ana!, { body: "ignored", ...text("From blocks") });
  expect(texts(both)).toEqual(["From blocks"]);

  const edited = await editUpdate(db, ana!, fromBody.id, { body: "Edited on an old page" });
  expect(texts(edited)).toEqual(["Edited on an old page"]);
});

it("shows the body of an update that has no blocks", async () => {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  await db.update.create({ data: { familyId: family.id, authorId: ana!.id, body: "Posted mid-deploy" } });

  expect((await listUpdates(db, ana!)).map(texts)).toEqual([["Posted mid-deploy"]]);
});

it("rejects invalid content and stores nothing", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  await expect(createUpdate(db, ana!, { body: "   " })).rejects.toBeInstanceOf(RequestError);
  await expect(createUpdate(db, ana!, { body: "x".repeat(20_001) })).rejects.toMatchObject({ status: 400 });
  await expect(createUpdate(db, ana!, text("ok", ""))).rejects.toMatchObject({ status: 400 });
  await expect(createUpdate(db, ana!, {})).rejects.toMatchObject({ status: 400 });
  expect(await db.update.count()).toBe(0);

  const update = await createUpdate(db, ana!, text("Kept"));
  await expect(editUpdate(db, ana!, update.id, { blocks: [] })).rejects.toMatchObject({ status: 400 });
  expect(texts((await listUpdates(db, ana!))[0]!)).toEqual(["Kept"]);
});
