import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { issueVideoUpload } from "../../server/notes.js";
import { createTestDb } from "./db.js";
import { fakeVideoStore, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

function doc(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

const PAST = "2019-03-03T15:30:00.000Z";
const TOMORROW = () => new Date(Date.now() + 86_400_000).toISOString();

describe("dating an update", () => {
  it("dates a new update to the chosen time, and the feed places it by that date", async () => {
    const { people: [ana] } = await makeFamily(db, "Rivera");
    const recent = await createUpdate(db, ana!, { content: doc("Recent") });
    const old = await createUpdate(db, ana!, { content: doc("From the past"), postedAt: PAST });
    const newest = await createUpdate(db, ana!, { content: doc("Newest") });

    expect(old.createdAt).toEqual(new Date(PAST));
    const feed = await listUpdates(db, ana!);
    expect(feed.map((u) => u.id)).toEqual([newest.id, recent.id, old.id]);
  });

  it("dates an update when it's posted now if no date is sent", async () => {
    const { people: [ana] } = await makeFamily(db, "Rivera");
    const before = Date.now();
    const update = await createUpdate(db, ana!, { content: doc("Now") });
    expect(update.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("lets a family member change an update's date when editing, without moving anything else", async () => {
    const { people: [ana, luis] } = await makeFamily(db, "Rivera", ["Ana", "Luis"]);
    const update = await createUpdate(db, ana!, { content: doc("Photos") });
    const edited = await editUpdate(db, luis!, update.id, { content: doc("Photos"), postedAt: PAST });
    expect(edited.createdAt).toEqual(new Date(PAST));
    expect(edited.authorName).toBe("Ana Rivera");

    const kept = await editUpdate(db, luis!, update.id, { content: doc("Photos, with text") });
    expect(kept.createdAt).toEqual(new Date(PAST));
  });

  it("refuses a supporter's date, creating and changing nothing", async () => {
    const { family, people: [ana] } = await makeFamily(db, "Rivera");
    const supporter = await db.person.create({
      data: { familyId: family.id, role: "supporter", name: "Sam Friend", email: "sam@example.com" },
    });
    const update = await createUpdate(db, ana!, { content: doc("Original") });

    await expect(createUpdate(db, supporter, { content: doc("x"), postedAt: PAST })).rejects.toMatchObject({ status: 403 });
    await expect(editUpdate(db, supporter, update.id, { content: doc("x"), postedAt: PAST })).rejects.toMatchObject({ status: 403 });
    expect(await db.update.count()).toBe(1);
    const stored = await db.update.findUniqueOrThrow({ where: { id: update.id } });
    expect(stored.createdAt).toEqual(update.createdAt);
  });

  it("refuses to date another family's update", async () => {
    const { people: [ana] } = await makeFamily(db, "Rivera");
    const { people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
    const theirs = await createUpdate(db, chidi!, { content: doc("Okafor news") });
    await expect(editUpdate(db, ana!, theirs.id, { postedAt: PAST, content: doc("x") })).rejects.toMatchObject({ status: 404 });
    const stored = await db.update.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(stored.createdAt).toEqual(theirs.createdAt);
  });

  it.each([
    ["a date in the future", TOMORROW],
    ["a date before 1900", () => "1899-12-31T23:59:59.000Z"],
    ["text that isn't a date", () => "last Tuesday"],
    ["a number", () => 1_500_000_000_000],
  ])("refuses %s, creating and changing nothing", async (_name, value) => {
    const { people: [ana] } = await makeFamily(db, "Rivera");
    const update = await createUpdate(db, ana!, { content: doc("Original") });

    await expect(createUpdate(db, ana!, { content: doc("x"), postedAt: value() })).rejects.toMatchObject({ status: 400 });
    await expect(editUpdate(db, ana!, update.id, { content: doc("x"), postedAt: value() })).rejects.toMatchObject({ status: 400 });
    expect(await db.update.count()).toBe(1);
    const stored = await db.update.findUniqueOrThrow({ where: { id: update.id } });
    expect(stored.createdAt).toEqual(update.createdAt);
    expect(stored.editedAt).toBeNull();
  });

  it("dates a video update, and refuses a date out of range or from a supporter, posting nothing", async () => {
    const { family, people: [ana] } = await makeFamily(db, "Rivera");
    const supporter = await db.person.create({
      data: { familyId: family.id, role: "supporter", name: "Sam Friend", email: "sam@example.com" },
    });
    const videos = fakeVideoStore();
    const upload = async (person: Person) => {
      const { publicId } = await issueVideoUpload(db, person, videos.store);
      videos.videos.set(publicId, 10);
      return publicId;
    };

    for (const postedAt of [TOMORROW(), "1899-12-31T23:59:59.000Z", "last Tuesday"]) {
      await expect(
        createUpdate(db, ana!, { video: await upload(ana!), postedAt }, undefined, undefined, videos.store),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      createUpdate(db, supporter, { video: "families/x/y", postedAt: PAST }, undefined, undefined, videos.store),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db.update.count()).toBe(0);

    const recent = await createUpdate(db, ana!, { video: await upload(ana!) }, undefined, undefined, videos.store);
    const old = await createUpdate(db, ana!, { video: await upload(ana!), postedAt: PAST }, undefined, undefined, videos.store);
    expect(old.createdAt).toEqual(new Date(PAST));
    expect((await listUpdates(db, ana!)).map((u) => u.id)).toEqual([recent.id, old.id]);
  });
});
