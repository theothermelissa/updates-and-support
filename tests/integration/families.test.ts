import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import { getSession } from "../../server/auth.js";
import { findFamilyBySlug, renameFamily } from "../../server/families.js";
import { createTestDb } from "./db.js";
import { answerCorrectly, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));
afterEach(() => {
  delete process.env.FAMILY_REDIRECTS;
});

it("follows an old address to its family's current one, and only there", async () => {
  const { family } = await makeFamily(db, "Okafor");
  const { family: other } = await makeFamily(db, "Rivera");
  await renameFamily(db, family.slug, { displayName: "Sam's Updates", slug: "for-sam" });
  process.env.FAMILY_REDIRECTS = `${family.slug}=for-sam, gone-k3f9m2xq=nobody-here`;

  expect((await findFamilyBySlug(db, family.slug))?.slug).toBe("for-sam");
  expect((await findFamilyBySlug(db, "for-sam"))?.id).toBe(family.id);
  expect((await findFamilyBySlug(db, other.slug))?.id).toBe(other.id);
  expect(await findFamilyBySlug(db, "gone-k3f9m2xq")).toBeNull();
});

it("gives a family a new name and address, and the old address finds nothing", async () => {
  const { family } = await makeFamily(db, "Okafor");
  const reader = await answerCorrectly(db, family);

  const renamed = await renameFamily(db, family.slug, { displayName: " Sam's Updates ", slug: " For-Sam " });

  expect(renamed).toMatchObject({ id: family.id, displayName: "Sam's Updates", slug: "for-sam" });
  expect((await findFamilyBySlug(db, "for-sam"))?.id).toBe(family.id);
  expect(await findFamilyBySlug(db, family.slug)).toBeNull();
  expect(await getSession(db, family.slug, reader.sessionToken)).toBeNull();
});

it("refuses another family's address, a malformed address or name, or an unknown family, changing nothing", async () => {
  const { family } = await makeFamily(db, "Okafor");
  const { family: other } = await makeFamily(db, "Rivera");
  const before = await db.family.findMany({ orderBy: { id: "asc" } });

  const attempts: [string, { displayName: string; slug: string }, string | RegExp][] = [
    [family.slug, { displayName: "Sam's Updates", slug: other.slug }, "That address belongs to another family."],
    [family.slug, { displayName: "Sam's Updates", slug: "for--sam" }, /Not a valid address/],
    [family.slug, { displayName: "   ", slug: "for-sam" }, /display name/],
    ["nobody-here", { displayName: "Sam's Updates", slug: "for-sam" }, "No family at /f/nobody-here."],
  ];
  for (const [current, input, message] of attempts) {
    await expect(renameFamily(db, current, input)).rejects.toThrow(message);
  }
  expect(await db.family.findMany({ orderBy: { id: "asc" } })).toEqual(before);
});
