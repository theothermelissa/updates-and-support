import { afterAll, beforeEach, expect, it } from "vitest";
import { RequestError } from "../../server/errors.js";
import { createUpdate, deleteUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

it("lists only the person's own family's updates", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const { people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  await createUpdate(db, ana!, "Rivera news");
  await createUpdate(db, chidi!, "Okafor news");

  expect((await listUpdates(db, ana!)).map((u) => u.body)).toEqual(["Rivera news"]);
});

it("refuses to edit or delete another family's update by ID, leaving it unchanged", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const { people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const theirs = await createUpdate(db, chidi!, "Okafor news");

  await expect(editUpdate(db, ana!, theirs.id, "hijacked")).rejects.toMatchObject({ status: 404 });
  await expect(deleteUpdate(db, ana!, theirs.id)).rejects.toMatchObject({ status: 404 });
  const stored = await db.update.findUniqueOrThrow({ where: { id: theirs.id } });
  expect(stored.body).toBe("Okafor news");
  expect(stored.editedAt).toBeNull();
});

it("lets a supporter read but not create, edit, or delete", async () => {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const supporter = await db.person.create({
    data: { familyId: family.id, role: "supporter", name: "Sam Friend", email: "sam@example.com" },
  });
  const update = await createUpdate(db, ana!, "Rivera news");

  expect(await listUpdates(db, supporter)).toHaveLength(1);
  await expect(createUpdate(db, supporter, "nope")).rejects.toMatchObject({ status: 403 });
  await expect(editUpdate(db, supporter, update.id, "nope")).rejects.toMatchObject({ status: 403 });
  await expect(deleteUpdate(db, supporter, update.id)).rejects.toMatchObject({ status: 403 });
  expect(await db.update.count()).toBe(1);
});

it("records edits by any family member, keeping the author, and deletes permanently", async () => {
  const { people: [ana, luis] } = await makeFamily(db, "Rivera", ["Ana", "Luis"]);
  const update = await createUpdate(db, ana!, "First draft");

  const edited = await editUpdate(db, luis!, update.id, "Second draft");
  expect(edited).toMatchObject({ body: "Second draft", authorName: "Ana Rivera" });
  expect(edited.editedAt).toBeInstanceOf(Date);

  await deleteUpdate(db, luis!, update.id);
  expect(await db.update.count()).toBe(0);
});

it("rejects an empty or oversized body", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  await expect(createUpdate(db, ana!, "   ")).rejects.toBeInstanceOf(RequestError);
  await expect(createUpdate(db, ana!, "x".repeat(20_001))).rejects.toMatchObject({ status: 400 });
});
