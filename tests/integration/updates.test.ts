import { afterAll, beforeEach, expect, it } from "vitest";
import { RequestError } from "../../server/errors.js";
import { createUpdate, deleteUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// A document of one paragraph, as the editor sends it.
function doc(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

it("lists only the person's own family's updates", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const { people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  await createUpdate(db, ana!, { content: doc("Rivera news") });
  await createUpdate(db, chidi!, { content: doc("Okafor news") });

  const listed = await listUpdates(db, ana!);
  expect(listed.map((u) => u.content)).toEqual([doc("Rivera news")]);
  expect(JSON.stringify(listed)).not.toContain("Okafor");
});

it("refuses to edit or delete another family's update by ID, leaving it unchanged", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const { people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const theirs = await createUpdate(db, chidi!, { content: doc("Okafor news") });

  await expect(editUpdate(db, ana!, theirs.id, { content: doc("hijacked") })).rejects.toMatchObject({ status: 404 });
  await expect(deleteUpdate(db, ana!, theirs.id)).rejects.toMatchObject({ status: 404 });
  const stored = await db.update.findUniqueOrThrow({ where: { id: theirs.id } });
  expect(stored.body).toBe("Okafor news");
  expect(stored.content).toEqual(doc("Okafor news"));
  expect(stored.editedAt).toBeNull();
});

it("lets a supporter read but not create, edit, or delete", async () => {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const supporter = await db.person.create({
    data: { familyId: family.id, role: "supporter", name: "Sam Friend", email: "sam@example.com" },
  });
  const update = await createUpdate(db, ana!, { content: doc("Rivera news") });

  expect(await listUpdates(db, supporter)).toHaveLength(1);
  await expect(createUpdate(db, supporter, { content: doc("nope") })).rejects.toMatchObject({ status: 403 });
  await expect(editUpdate(db, supporter, update.id, { content: doc("nope") })).rejects.toMatchObject({ status: 403 });
  await expect(deleteUpdate(db, supporter, update.id)).rejects.toMatchObject({ status: 403 });
  expect(await db.update.count()).toBe(1);
  expect((await db.update.findUniqueOrThrow({ where: { id: update.id } })).body).toBe("Rivera news");
});

it("records edits by any family member, keeping the author, and deletes permanently", async () => {
  const { people: [ana, luis] } = await makeFamily(db, "Rivera", ["Ana", "Luis"]);
  const update = await createUpdate(db, ana!, { content: doc("First draft") });

  const edited = await editUpdate(db, luis!, update.id, { content: doc("Second draft") });
  expect(edited).toMatchObject({ content: doc("Second draft"), authorName: "Ana Rivera" });
  expect(edited.editedAt).toBeInstanceOf(Date);

  await deleteUpdate(db, luis!, update.id);
  expect(await db.update.count()).toBe(0);
});

it("stores formatting as checked, with body kept as its plain text", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const link = { href: "https://example.com/meals", target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null };
  const sent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Surgery went ", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "meal train", marks: [{ type: "link", attrs: link }] },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3, type: "a" },
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Rest" }] }] }],
      },
    ],
  };
  const stored = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Surgery went ", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "meal train", marks: [{ type: "link", attrs: { href: "https://example.com/meals" } }] },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3, type: null },
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Rest" }] }] }],
      },
    ],
  };
  await createUpdate(db, ana!, { content: sent });

  const row = await db.update.findFirstOrThrow();
  expect(row.content).toEqual(stored);
  expect(row.body).toBe("Surgery went \nmeal train\n\n3. Rest");
  expect((await listUpdates(db, ana!))[0]!.content).toEqual(stored);
});

it("shows body when it no longer matches content, as after an edit by older code", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const update = await createUpdate(db, ana!, { content: doc("Original") });
  await db.update.update({ where: { id: update.id }, data: { body: "Changed by older code" } });

  expect((await listUpdates(db, ana!))[0]!.content).toEqual(doc("Changed by older code"));
});

it("converts an update with no content from its body, linking web addresses", async () => {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  await db.update.create({
    data: { familyId: family.id, authorId: ana!.id, body: 'She said "hi" \\o/\n\nSee https://example.com.' },
  });
  const [row] = await db.$queryRaw<{ isNull: boolean }[]>`SELECT content IS NULL AS "isNull" FROM "Update"`;
  expect(row!.isNull).toBe(true);

  expect((await listUpdates(db, ana!))[0]!.content).toEqual({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: 'She said "hi" \\o/' }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See " },
          { type: "text", text: "https://example.com", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
          { type: "text", text: "." },
        ],
      },
    ],
  });
});

it("still accepts plain text from pages loaded before formatting", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const update = await createUpdate(db, ana!, { body: "  Line one\nLine two  " });
  expect(update.content).toEqual({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Line one" }, { type: "hardBreak" }, { type: "text", text: "Line two" }] },
    ],
  });
  expect(update.body).toBe("Line one\nLine two");

  const edited = await editUpdate(db, ana!, update.id, { body: "Edited" });
  expect(edited.content).toEqual(doc("Edited"));
  expect((await db.update.findUniqueOrThrow({ where: { id: update.id } })).body).toBe("Edited");
});

it("uses content when a request sends both", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const update = await createUpdate(db, ana!, { content: doc("From content"), body: "From body" });
  expect(update.body).toBe("From content");
});

it("refuses an invalid document, storing nothing and leaving an edited update unchanged", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  const bad = { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Big" }] }] };
  await expect(createUpdate(db, ana!, { content: bad })).rejects.toMatchObject({ status: 400 });
  expect(await db.update.count()).toBe(0);

  const update = await createUpdate(db, ana!, { content: doc("Kept") });
  const badLink = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
  };
  await expect(editUpdate(db, ana!, update.id, { content: badLink })).rejects.toMatchObject({ status: 400 });
  const stored = await db.update.findUniqueOrThrow({ where: { id: update.id } });
  expect(stored.content).toEqual(doc("Kept"));
  expect(stored.editedAt).toBeNull();
});

it("refuses an empty or oversized update", async () => {
  const { people: [ana] } = await makeFamily(db, "Rivera");
  await expect(createUpdate(db, ana!, { body: "   " })).rejects.toBeInstanceOf(RequestError);
  await expect(createUpdate(db, ana!, { body: "x".repeat(20_001) })).rejects.toMatchObject({ status: 400 });
  await expect(createUpdate(db, ana!, { content: doc(" ") })).rejects.toMatchObject({ status: 400 });
  await expect(createUpdate(db, ana!, { content: doc("x".repeat(20_001)) })).rejects.toMatchObject({ status: 400 });
  await expect(createUpdate(db, ana!, {})).rejects.toMatchObject({ status: 400 });
  expect(await db.update.count()).toBe(0);
});
