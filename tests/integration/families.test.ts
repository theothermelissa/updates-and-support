import { afterAll, beforeEach, expect, it } from "vitest";
import { getSession } from "../../server/auth.js";
import { findFamilyBySlug, renameFamily } from "../../server/families.js";
import { createTestDb } from "./db.js";
import { answerCorrectly, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

it("gives a family a new name and address, and the old address finds nothing", async () => {
  const { family } = await makeFamily(db, "Stone");
  const reader = await answerCorrectly(db, family);

  const renamed = await renameFamily(db, family.slug, { displayName: " Ginger's Updates ", slug: " For-Ginger " });

  expect(renamed).toMatchObject({ id: family.id, displayName: "Ginger's Updates", slug: "for-ginger" });
  expect((await findFamilyBySlug(db, "for-ginger"))?.id).toBe(family.id);
  expect(await findFamilyBySlug(db, family.slug)).toBeNull();
  expect(await getSession(db, family.slug, reader.sessionToken)).toBeNull();
});

it("refuses another family's address, a malformed address or name, or an unknown family, changing nothing", async () => {
  const { family } = await makeFamily(db, "Stone");
  const { family: other } = await makeFamily(db, "Rivera");
  const before = await db.family.findMany({ orderBy: { id: "asc" } });

  const attempts: [string, { displayName: string; slug: string }, string | RegExp][] = [
    [family.slug, { displayName: "Ginger's Updates", slug: other.slug }, "That address belongs to another family."],
    [family.slug, { displayName: "Ginger's Updates", slug: "for--ginger" }, /Not a valid address/],
    [family.slug, { displayName: "   ", slug: "for-ginger" }, /display name/],
    ["nobody-here", { displayName: "Ginger's Updates", slug: "for-ginger" }, "No family at /f/nobody-here."],
  ];
  for (const [current, input, message] of attempts) {
    await expect(renameFamily(db, current, input)).rejects.toThrow(message);
  }
  expect(await db.family.findMany({ orderBy: { id: "asc" } })).toEqual(before);
});
