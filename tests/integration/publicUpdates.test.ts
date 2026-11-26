import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import publicHandler from "../../api/f/[slug]/public-updates.js";
import { lockGroups } from "../../server/audience.js";
import { photoUrl } from "../../server/cloudinary.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { createNote, issueVideoUpload } from "../../server/notes.js";
import type { PhotoSettings } from "../../server/photoSettings.js";
import { setReaction } from "../../server/reactions.js";
import { listPublicUpdates, PUBLIC_LIMIT, setPublicNotice, setPublicUpdates } from "../../server/publicUpdates.js";
import { createUpdate, deleteUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { fakeMailer, fakeVideoStore, makeFamily, makeGroup, makeNonAdmin, queuedOrDone, resetDb, verifiedSupporter, answerCorrectly } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The handler reads DATABASE_URL, which CI doesn't set; the tests use their own database.
const savedUrl = process.env.DATABASE_URL;
beforeAll(() => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
});
afterAll(() => {
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
});

const CLOUD = { cloudName: "demo", apiKey: "1234", apiSecret: "abcd" };
const PHOTOS: PhotoSettings = { placeholders: false, cloudinary: CLOUD, destroy: async () => {} };

const photoId = (familyId: string, c: string) => `families/${familyId}/${c.repeat(22)}`;
const withPhoto = (text: string, publicId: string) => ({
  type: "doc" as const,
  content: [
    { type: "paragraph" as const, content: [{ type: "text" as const, text }] },
    { type: "photo" as const, attrs: { caption: "A caption", publicId } },
  ],
});

// The Rivera family: Ana (admin), Ben (not an admin), Gia (verified, in Neighbors), Ned (answered the
// question only). Public updates are on for the Rivera and Okafor families. Updates: PUB (public, with
// a photo), EV (everyone, with a photo), NB (Neighbors), and FAM (family members only).
async function setUp() {
  const { family, people } = await makeFamily(db, "Rivera", ["Ana"]);
  const ana = people[0] as Person;
  const ben = await makeNonAdmin(db, family, "Ben");
  const gia = await verifiedSupporter(db, family, "Gia");
  const ned = (await answerCorrectly(db, family)).person;
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  await setPublicUpdates(db, ana, { on: true });
  await setPublicUpdates(db, chidi as Person, { on: true });
  const neighbors = await makeGroup(db, family.id, "Neighbors", [gia.id]);

  const pub = await createUpdate(
    db,
    ana,
    { content: withPhoto("Zinnia-public news", photoId(family.id, "p")), audience: "public" },
    undefined,
    PHOTOS,
  );
  const ev = await createUpdate(db, ana, { content: withPhoto("Everyone news", photoId(family.id, "e")) }, undefined, PHOTOS);
  const nb = await createUpdate(db, ana, { body: "Neighbors news", audience: { groups: [neighbors.id] } });
  const fam = await db.update.create({
    data: { familyId: family.id, authorId: ana.id, body: "Family news", audience: "groups" },
  });
  const okaforPub = await createUpdate(db, chidi as Person, { body: "Okafor public news", audience: "public" });
  return { family, okafor, ana, ben, gia, ned, chidi: chidi as Person, neighbors, pub, ev, nb, fam, okaforPub };
}

async function visitorSees(family: { id: string; publicNotice: string | null }) {
  return listPublicUpdates(db, family, PHOTOS);
}
const familyRow = (id: string) => db.family.findUniqueOrThrow({ where: { id } });

describe("what a visitor who isn't signed in reads", () => {
  it("is only this family's public updates", async () => {
    const s = await setUp();
    const seen = await visitorSees(await familyRow(s.family.id));
    expect(seen.updates.map((u) => u.id)).toEqual([s.pub.id]);
    const other = await visitorSees(await familyRow(s.okafor.id));
    expect(other.updates.map((u) => u.id)).toEqual([s.okaforPub.id]);
  });

  it("shows nothing while the family's switch is off, even for a row that says public", async () => {
    const s = await setUp();
    await db.family.update({ where: { id: s.family.id }, data: { publicUpdatesOn: false } });
    expect((await visitorSees(await familyRow(s.family.id))).updates).toEqual([]);
  });

  it("never shows a video, even a row that says public", async () => {
    const s = await setUp();
    await db.update.create({
      data: { familyId: s.family.id, authorId: s.ana.id, body: "[Video]", videoId: "videos/x", audience: "public" },
    });
    const seen = await visitorSees(await familyRow(s.family.id));
    expect(seen.updates.map((u) => u.id)).toEqual([s.pub.id]);
  });

  it("is only the latest 20, newest first", async () => {
    const s = await setUp();
    for (let i = 0; i < PUBLIC_LIMIT + 2; i++) {
      await createUpdate(db, s.ana, { body: `More ${i}`, audience: "public" });
    }
    const seen = await visitorSees(await familyRow(s.family.id));
    expect(seen.updates).toHaveLength(PUBLIC_LIMIT);
    const times = seen.updates.map((u) => u.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("carries nothing but text, photos, the time, and an unnamed reaction count", async () => {
    const s = await setUp();
    await setReaction(db, s.gia, { updateId: s.pub.id, kind: "heart" });
    await setReaction(db, s.ana, { updateId: s.pub.id, kind: "heart" });
    await setReaction(db, s.ben, { updateId: s.pub.id, kind: "hug" });
    await createNote(db, s.gia, { updateId: s.pub.id, body: "Quartz-secret note", color: "sky" });
    await db.update.update({ where: { id: s.pub.id }, data: { editedAt: new Date() } });
    const seen = await visitorSees(await familyRow(s.family.id));
    const [only] = seen.updates;
    expect(Object.keys(only!).sort()).toEqual(["content", "createdAt", "id", "reactions"]);
    expect(only!.reactions).toEqual({ count: 3, kinds: ["heart", "hug"] });
    // A photo's signed link names the family's internal id in its path, as it does for a signed-in
    // reader, and grants nothing; nothing else may carry it.
    const wire = JSON.stringify(seen).replace(/https:\/\/res\.cloudinary\.com\/[^"]+/g, "<photo link>");
    for (const secret of ["Quartz-secret", "Ana Rivera", "Ben", "Gia", "Neighbors", s.family.id, "families/", "publicId", "everyone"]) {
      expect(wire).not.toContain(secret);
    }
    expect(wire).toContain("Zinnia-public news");
  });

  it("signs a photo link only for a public update, and stops the moment it stops being public", async () => {
    const s = await setUp();
    const pubPhoto = photoUrl(CLOUD, photoId(s.family.id, "p"));
    const evPhoto = photoUrl(CLOUD, photoId(s.family.id, "e"));
    let wire = JSON.stringify(await visitorSees(await familyRow(s.family.id)));
    expect(wire).toContain(pubPhoto);
    expect(wire).not.toContain(evPhoto);

    await editUpdate(db, s.ana, s.pub.id, { content: withPhoto("Zinnia-public news", photoId(s.family.id, "p")), audience: "everyone" }, PHOTOS);
    wire = JSON.stringify(await visitorSees(await familyRow(s.family.id)));
    expect(wire).not.toContain(pubPhoto);
    expect(wire).not.toContain("Zinnia");
  });

  it("sends the family's banner wording only while there is a public update to show", async () => {
    const s = await setUp();
    await setPublicNotice(db, s.ana, { publicNotice: "  Be kind\n here  " });
    expect(await visitorSees(await familyRow(s.family.id))).toMatchObject({ notice: "Be kind here" });
    await deleteUpdate(db, s.ben, s.pub.id);
    const none = await visitorSees(await familyRow(s.family.id));
    expect(none).toEqual({ updates: [] });
  });

  it("is served to anyone through the handler, with no cookie", async () => {
    const s = await setUp();
    const { status, body } = await call("GET", s.family.slug, undefined);
    expect(status).toBe(200);
    expect((body.updates as { id: string }[]).map((u) => u.id)).toEqual([s.pub.id]);
    expect((await call("GET", "no-such-family", undefined)).status).toBe(404);
  });
});

describe("who can make an update public", () => {
  it("lets an admin, and nobody else", async () => {
    const s = await setUp();
    await expect(createUpdate(db, s.ben, { body: "x", audience: "public" })).rejects.toMatchObject({ status: 403 });
    await expect(createUpdate(db, s.gia, { body: "x", audience: "public" })).rejects.toMatchObject({ status: 403 });
    await expect(editUpdate(db, s.ben, s.ev.id, { body: "x", audience: "public" })).rejects.toMatchObject({ status: 403 });
    expect((await db.update.findUniqueOrThrow({ where: { id: s.ev.id } })).audience).toBe("everyone");
    await editUpdate(db, s.ana, s.ev.id, { body: "Now public", audience: "public" });
    expect((await db.update.findUniqueOrThrow({ where: { id: s.ev.id } })).audience).toBe("public");
  });

  it("refuses an admin who was demoted after the request began", async () => {
    const s = await setUp();
    await db.person.update({ where: { id: s.ana.id }, data: { isAdmin: false } });
    // s.ana is the copy loaded before the demotion, as a request's would be.
    await expect(createUpdate(db, s.ana, { body: "x", audience: "public" })).rejects.toMatchObject({ status: 403 });
    await expect(editUpdate(db, s.ana, s.ev.id, { body: "x", audience: "public" })).rejects.toMatchObject({ status: 403 });
    expect(await db.update.count({ where: { audience: "public", familyId: s.family.id } })).toBe(1);
  });

  it("refuses while the family's switch is off", async () => {
    const s = await setUp();
    await db.family.update({ where: { id: s.family.id }, data: { publicUpdatesOn: false } });
    await expect(createUpdate(db, s.ana, { body: "x", audience: "public" })).rejects.toMatchObject({ status: 403 });
    await expect(editUpdate(db, s.ana, s.ev.id, { body: "x", audience: "public" })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a video update", async () => {
    const s = await setUp();
    // A real, finished upload, so only the audience can be what refuses it.
    const videos = fakeVideoStore();
    const { publicId } = await issueVideoUpload(db, s.ana, videos.store);
    videos.videos.set(publicId, 30);
    await expect(
      createUpdate(db, s.ana, { video: publicId, audience: "public" }, undefined, PHOTOS, videos.store),
    ).rejects.toMatchObject({ status: 400, message: "A video update can't be public" });
    expect(await db.update.count({ where: { videoId: { not: null } } })).toBe(0);
    // The same upload posts fine for everyone, so the refusal above was about the audience.
    await createUpdate(db, s.ana, { video: publicId, audience: "everyone" }, undefined, PHOTOS, videos.store);
    expect(await db.update.count({ where: { videoId: publicId } })).toBe(1);
  });

  it("lets any family member edit a public update's text and delete it, but only an admin change who sees it", async () => {
    const s = await setUp();
    await editUpdate(db, s.ben, s.pub.id, { content: withPhoto("Edited by Ben", photoId(s.family.id, "p")) }, PHOTOS);
    let row = await db.update.findUniqueOrThrow({ where: { id: s.pub.id } });
    expect(row.body).toContain("Edited by Ben");
    expect(row.audience).toBe("public");
    for (const audience of ["everyone", "public", { groups: [s.neighbors.id] }] as const) {
      await expect(editUpdate(db, s.ben, s.pub.id, { body: "Again", audience })).rejects.toMatchObject({ status: 403 });
    }
    row = await db.update.findUniqueOrThrow({ where: { id: s.pub.id } });
    expect(row.audience).toBe("public");
    expect(row.body).toContain("Edited by Ben");
    await deleteUpdate(db, s.ben, s.pub.id);
    expect(await db.update.findUnique({ where: { id: s.pub.id } })).toBeNull();
  });

  it("lets only an admin turn public updates on or off, or reword the banner", async () => {
    const s = await setUp();
    await expect(setPublicUpdates(db, s.ben, { on: false })).rejects.toMatchObject({ status: 403 });
    await expect(setPublicUpdates(db, s.gia, { on: false })).rejects.toMatchObject({ status: 403 });
    await expect(setPublicNotice(db, s.ben, { publicNotice: "x" })).rejects.toMatchObject({ status: 403 });
    expect((await familyRow(s.family.id)).publicUpdatesOn).toBe(true);
    expect((await call("PUT", s.family.slug, undefined, { on: false })).status).toBe(401);
  });
});

describe("turning public updates off", () => {
  it("turns every public update of that family into an everyone update, and reports how many", async () => {
    const s = await setUp();
    await createUpdate(db, s.ana, { body: "A second public one", audience: "public" });
    const result = await setPublicUpdates(db, s.ana, { on: false });
    expect(result).toEqual({ on: false, converted: 2 });
    expect(await db.update.count({ where: { familyId: s.family.id, audience: "public" } })).toBe(0);
    expect((await db.update.findUniqueOrThrow({ where: { id: s.pub.id } })).audience).toBe("everyone");
    // Another family's public update is untouched.
    expect((await db.update.findUniqueOrThrow({ where: { id: s.okaforPub.id } })).audience).toBe("public");
    // Signed-in readers still read it, as an everyone update.
    expect((await listUpdates(db, s.gia)).map((u) => u.id)).toContain(s.pub.id);
    // Turning it back on makes nothing public again.
    await setPublicUpdates(db, s.ana, { on: true });
    expect((await visitorSees(await familyRow(s.family.id))).updates).toEqual([]);
  });

  it("settles a public post that races it: the post is refused, never left public", async () => {
    const s = await setUp();
    let locked!: () => void;
    const hasLock = new Promise<void>((r) => (locked = r));
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    // The test holds the groups lock, as a turn-off does, and flips the switch under it.
    const holder = db.$transaction(async (tx) => {
      await lockGroups(tx, s.family.id);
      await tx.family.update({ where: { id: s.family.id }, data: { publicUpdatesOn: false } });
      locked();
      await released;
    });
    await hasLock;
    const posting = createUpdate(db, s.ana, { body: "Racing post", audience: "public" });
    const editing = editUpdate(db, s.ana, s.ev.id, { body: "Racing edit", audience: "public" });
    await queuedOrDone(db, Promise.all([posting.catch(() => {}), editing.catch(() => {})]), "advisory");
    release();
    await holder;
    await expect(posting).rejects.toMatchObject({ status: 403 });
    await expect(editing).rejects.toMatchObject({ status: 403 });
    expect(await db.update.count({ where: { body: "Racing post" } })).toBe(0);
    expect((await db.update.findUniqueOrThrow({ where: { id: s.ev.id } })).audience).toBe("everyone");
  });

  it("waits for a text edit that omits the audience, then converts, without a deadlock", async () => {
    const s = await setUp();
    let locked!: () => void;
    const hasLock = new Promise<void>((r) => (locked = r));
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    // The test holds the update's row, as an edit in progress does.
    const holder = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Update" WHERE id = ${s.pub.id} FOR UPDATE`;
      locked();
      await released;
    });
    await hasLock;
    const editing = editUpdate(db, s.ben, s.pub.id, { body: "Ben's edit" });
    await queuedOrDone(db, editing, "transactionid");
    const turningOff = setPublicUpdates(db, s.ana, { on: false });
    await queuedOrDone(db, turningOff, "transactionid");
    release();
    await holder;
    const results = await Promise.allSettled([editing, turningOff]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const row = await db.update.findUniqueOrThrow({ where: { id: s.pub.id } });
    expect(row).toMatchObject({ audience: "everyone", body: "Ben's edit" });
  });
});

describe("signed-in readers", () => {
  it("read a public update like an everyone update, whatever their groups", async () => {
    const s = await setUp();
    for (const reader of [s.gia, s.ned]) {
      expect((await listUpdates(db, reader)).map((u) => u.id)).toContain(s.pub.id);
    }
    const supporter = await verifiedSupporter(db, s.family, "Pia");
    expect((await listUpdates(db, supporter)).map((u) => u.id).sort()).toEqual([s.ev.id, s.pub.id].sort());
    // A supporter never learns the audience, and family members see it as public.
    expect((await listUpdates(db, s.gia)).find((u) => u.id === s.pub.id)).not.toHaveProperty("audience");
    expect((await listUpdates(db, s.ana)).find((u) => u.id === s.pub.id)?.audience).toBe("public");
    // Another family's supporter never does.
    const olu = await verifiedSupporter(db, s.okafor, "Olu");
    expect((await listUpdates(db, olu)).map((u) => u.id)).toEqual([s.okaforPub.id]);
  });

  it("are emailed about a public update like everyone", async () => {
    const s = await setUp();
    const mail = fakeMailer();
    await createUpdate(db, s.ana, { body: "Emailed", audience: "public" }, mail.sendMany);
    expect(mail.sent.map((e) => e.to).sort()).toEqual(["ben@example.com", "gia@example.com"]);
  });
});

async function call(method: string, slug: string, token: string | undefined, body?: unknown) {
  const req = {
    method,
    query: { slug },
    headers: { "content-type": "application/json" },
    body,
    cookies: token ? { [`session_${slug}`]: token } : {},
  };
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader() {},
    appendHeader() {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  await publicHandler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return { status: res.statusCode, body: res.body as Record<string, unknown> };
}
