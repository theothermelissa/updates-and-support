import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import notesHandler from "../../api/f/[slug]/notes/index.js";
import updatesHandler from "../../api/f/[slug]/updates/index.js";
import { getDb } from "../../server/db.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { createNote, deleteNote, issueVideoUpload, listNotes } from "../../server/notes.js";
import { addFamilyMember, setRemoved, verifySupporter } from "../../server/people.js";
import type { PhotoSettings } from "../../server/photoSettings.js";
import { setReaction } from "../../server/reactions.js";
import { hashToken, newToken } from "../../server/tokens.js";
import { canSeeUpdate, GROUP_GONE } from "../../server/audience.js";
import { createUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { answerCorrectly, fakeMailer, fakeVideoStore, joinWithEmail, makeFamily, makeGroup, resetDb, verifiedSupporter } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const CLOUD = { cloudName: "demo", apiKey: "1234", apiSecret: "abcd" };
const PHOTOS: PhotoSettings = { placeholders: false, cloudinary: CLOUD, destroy: async () => {} };

// Shares an update with these groups, inserted directly. No groups is "Family members only".
async function shareWith(updateId: string, groupIds: string[]) {
  await db.update.update({ where: { id: updateId }, data: { audience: "groups" } });
  await db.updateGroup.createMany({ data: groupIds.map((groupId) => ({ updateId, groupId })) });
}

// The Rivera family, its supporters and groups, and its updates E (everyone), N (Neighbors),
// NI (Neighbors and Investors), and F (family members only). The Okafor family has its own
// Neighbors group with Olu, and one update.
async function setUp() {
  const { family, people } = await makeFamily(db, "Rivera", ["Ana", "Ben", "Fay"]);
  const [ana, ben, fay] = people as [Person, Person, Person];
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const gia = await verifiedSupporter(db, family, "Gia");
  const pia = await verifiedSupporter(db, family, "Pia");
  const hal = await verifiedSupporter(db, family, "Hal");
  const uma = (await joinWithEmail(db, family, "Uma")).person;
  const rae = await verifiedSupporter(db, family, "Rae");
  const ned = (await answerCorrectly(db, family)).person;
  const olu = await verifiedSupporter(db, okafor, "Olu");
  // Fay is removed, and keeps notifications on, as a removed family member does.
  await setRemoved(db, ana, fay.id, true);

  const neighbors = await makeGroup(db, family.id, "Neighbors", [gia.id, pia.id, uma.id, rae.id]);
  const investors = await makeGroup(db, family.id, "Investors", [hal.id]);
  const okaforNeighbors = await makeGroup(db, okafor.id, "Neighbors", [olu.id]);

  const photoId = `families/${family.id}/${"n".repeat(22)}`;
  const e = await createUpdate(db, ana, { body: "Everyone news" });
  const n = await createUpdate(
    db,
    ana,
    {
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Zinnia-secret neighbors news" }] },
          { type: "photo", attrs: { caption: "Porch", publicId: photoId } },
        ],
      },
    },
    undefined,
    PHOTOS,
  );
  const ni = await createUpdate(db, ana, { body: "News for two groups" });
  const f = await createUpdate(db, ana, { body: "Family only news" });
  await shareWith(n.id, [neighbors.id]);
  await shareWith(ni.id, [neighbors.id, investors.id]);
  await shareWith(f.id, []);
  const o = await createUpdate(db, chidi!, { body: "Okafor news" });

  return {
    family,
    okafor,
    ana,
    ben,
    fay,
    chidi: chidi!,
    gia,
    pia,
    hal,
    uma,
    rae,
    ned,
    olu,
    neighbors,
    investors,
    okaforNeighbors,
    photoId,
    e: e.id,
    n: n.id,
    ni: ni.id,
    f: f.id,
    o: o.id,
  };
}

async function seen(person: Person): Promise<string[]> {
  return (await listUpdates(db, person)).map((u) => u.id).sort();
}

function sorted(...ids: string[]) {
  return [...ids].sort();
}

// A refusal's status and message, to compare with the refusal for something that doesn't exist.
async function refusal(work: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await work;
  } catch (err) {
    const { status, message } = err as { status: number; message: string };
    return { status, message };
  }
  throw new Error("Expected a refusal");
}

// A video this person was issued a ticket for and has "uploaded" to the fake host.
async function uploadedVideo(videos: ReturnType<typeof fakeVideoStore>, person: Person) {
  const { publicId } = await issueVideoUpload(db, person, videos.store);
  videos.videos.set(publicId, 10);
  return publicId;
}

function note(person: Person, updateId: string, body = "Thinking of you") {
  return createNote(db, person, { updateId, body, color: "sky" });
}

describe("who sees which updates", () => {
  it("shows each person exactly the updates in their audience", async () => {
    const s = await setUp();
    expect(await seen(s.ana)).toEqual(sorted(s.e, s.n, s.ni, s.f));
    expect(await seen(s.ben)).toEqual(sorted(s.e, s.n, s.ni, s.f));
    expect(await seen(s.gia)).toEqual(sorted(s.e, s.n, s.ni));
    expect(await seen(s.pia)).toEqual(sorted(s.e, s.n, s.ni));
    expect(await seen(s.hal)).toEqual(sorted(s.e, s.ni));
    expect(await seen(s.uma)).toEqual([s.e]);
    expect(await seen(s.ned)).toEqual([s.e]);
    expect(await seen(s.olu)).toEqual([s.o]);
  });

  it("shows an unverified member nothing of the group until their email is verified", async () => {
    const s = await setUp();
    expect(await seen(s.uma)).toEqual([s.e]);
    await verifySupporter(db, s.ana, s.uma.id, true);
    expect(await seen(s.uma)).toEqual(sorted(s.e, s.n, s.ni));
  });

  it("hides a group's updates from a removed member, and shows them again on restoring", async () => {
    const s = await setUp();
    expect(await seen(s.rae)).toContain(s.n);
    await setRemoved(db, s.ana, s.rae.id, true);
    // The stale Person from before removal: getSession would refuse her anyway.
    expect(await seen(s.rae)).toEqual([s.e]);
    await setRemoved(db, s.ana, s.rae.id, false);
    expect(await seen(s.rae)).toEqual(sorted(s.e, s.n, s.ni));
  });

  it("reads membership on every request", async () => {
    const s = await setUp();
    expect(await seen(s.gia)).toEqual(sorted(s.e, s.n, s.ni));
    await db.groupMember.delete({ where: { groupId_personId: { groupId: s.neighbors.id, personId: s.gia.id } } });
    expect(await seen(s.gia)).toEqual([s.e]);
    expect(await seen(s.hal)).toEqual(sorted(s.e, s.ni));
  });

  it("grants nothing through another family's group", async () => {
    const s = await setUp();
    await db.$transaction([
      db.groupMember.create({ data: { groupId: s.okaforNeighbors.id, personId: s.hal.id } }),
      db.updateGroup.create({ data: { updateId: s.n, groupId: s.okaforNeighbors.id } }),
    ]);
    expect(await seen(s.hal)).toEqual(sorted(s.e, s.ni));
  });
});

describe("an update outside the audience is not found everywhere", () => {
  it("refuses reacting to it, with a kind and clearing", async () => {
    const s = await setUp();
    for (const kind of ["heart", null]) {
      const missing = await refusal(setReaction(db, s.hal, { updateId: "no-such-update", kind }));
      expect(missing.status).toBe(404);
      expect(await refusal(setReaction(db, s.hal, { updateId: s.n, kind }))).toEqual(missing);
      await setReaction(db, s.gia, { updateId: s.n, kind });
      await setReaction(db, s.hal, { updateId: s.ni, kind });
    }
    expect(await db.reaction.count({ where: { personId: s.hal.id, updateId: s.n } })).toBe(0);
  });

  it("refuses a reaction the hidden update doesn't allow as not found, not as unavailable", async () => {
    const s = await setUp();
    await db.update.update({ where: { id: s.n }, data: { reactionKinds: [] } });
    const missing = await refusal(setReaction(db, s.hal, { updateId: "no-such-update", kind: "heart" }));
    expect(await refusal(setReaction(db, s.hal, { updateId: s.n, kind: "heart" }))).toEqual(missing);
    // Gia can see N, so she gets the real answer: the update exists and allows no reactions.
    expect((await refusal(setReaction(db, s.gia, { updateId: s.n, kind: "heart" }))).status).toBe(400);
  });

  it("refuses reacting to a note on it", async () => {
    const s = await setUp();
    const { note: giaNote } = await note(s.gia, s.n);
    const missing = await refusal(setReaction(db, s.hal, { noteId: "no-such-note", kind: "heart" }));
    expect(missing.status).toBe(404);
    expect(await refusal(setReaction(db, s.hal, { noteId: giaNote.id, kind: "heart" }))).toEqual(missing);
    expect(await refusal(setReaction(db, s.hal, { noteId: giaNote.id, kind: null }))).toEqual(missing);
    await setReaction(db, s.gia, { noteId: giaNote.id, kind: "heart" });
    expect(await db.noteReaction.count({ where: { noteId: giaNote.id } })).toBe(1);
  });

  it("refuses leaving a note on it, before saying notes are off or the hourly limit is reached", async () => {
    const s = await setUp();
    const missing = await refusal(note(s.hal, "no-such-update"));
    expect(missing.status).toBe(404);
    expect(await refusal(note(s.hal, s.n))).toEqual(missing);
    await note(s.gia, s.n);

    await db.update.update({ where: { id: s.n }, data: { allowNotes: false } });
    expect(await refusal(note(s.hal, s.n))).toEqual(missing);
    expect(await refusal(note(s.gia, s.n))).toEqual({ status: 403, message: "Notes are turned off for this update" });
    await db.update.update({ where: { id: s.n }, data: { allowNotes: true } });

    await db.note.createMany({
      data: Array.from({ length: 20 }, () => ({ updateId: s.e, authorId: s.hal.id, body: "Hi", color: "sky" as const })),
    });
    expect(await refusal(note(s.hal, s.n))).toEqual(missing);
    expect((await refusal(note(s.hal, s.e))).status).toBe(429);
    expect(await db.note.count({ where: { updateId: s.n, authorId: s.hal.id } })).toBe(0);
  });

  it("refuses deleting your own note on it", async () => {
    const s = await setUp();
    // N is briefly shared with Investors too, so Hal can leave a note, then narrowed again.
    await db.updateGroup.create({ data: { updateId: s.n, groupId: s.investors.id } });
    const { note: halOnN } = await note(s.hal, s.n);
    await db.updateGroup.delete({ where: { updateId_groupId: { updateId: s.n, groupId: s.investors.id } } });

    const missing = await refusal(deleteNote(db, s.hal, "no-such-note"));
    expect(missing.status).toBe(404);
    expect(await refusal(deleteNote(db, s.hal, halOnN.id))).toEqual(missing);
    expect(await db.note.count({ where: { id: halOnN.id } })).toBe(1);

    const { note: halOnNi } = await note(s.hal, s.ni);
    await deleteNote(db, s.hal, halOnNi.id);
    expect(await db.note.count({ where: { id: halOnNi.id } })).toBe(0);
  });

  it("leaves its notes off the wall", async () => {
    const s = await setUp();
    await note(s.gia, s.n, "Gia on N");
    await note(s.gia, s.ni, "Gia on NI");
    const halWall = await listNotes(db, s.hal);
    expect(halWall.map((n) => n.updateId)).toEqual([s.ni]);
    const giaWall = await listNotes(db, s.gia);
    expect(giaWall.map((n) => n.updateId).sort()).toEqual(sorted(s.n, s.ni));
  });
});

// The handlers read the database and Cloudinary from the environment.
const savedUrl = process.env.DATABASE_URL;
const savedCloud = process.env.CLOUDINARY_URL;

beforeAll(() => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.CLOUDINARY_URL = "cloudinary://1234:abcd-secret@demo";
});

afterAll(async () => {
  await getDb().$disconnect();
  restore("DATABASE_URL", savedUrl);
  restore("CLOUDINARY_URL", savedCloud);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function sessionFor(personId: string) {
  const token = newToken();
  await db.session.create({
    data: { personId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}

async function get(handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>, slug: string, token: string) {
  const req = { method: "GET", query: { slug }, headers: {}, cookies: { [`session_${slug}`]: token } };
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
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  expect(res.statusCode).toBe(200);
  return res.body as Record<string, unknown>;
}

describe("nothing hidden leaks into a supporter's responses", () => {
  it("leaves out the update, its photo, video, notes, reactions, and audience", async () => {
    const s = await setUp();
    const videos = fakeVideoStore();
    const uploaded = (person: Person) => uploadedVideo(videos, person);
    const updateVideo = await uploaded(s.ana);
    const v = await createUpdate(db, s.ana, { video: updateVideo }, undefined, PHOTOS, videos.store);
    await shareWith(v.id, [s.neighbors.id]);
    await createNote(db, s.gia, { updateId: s.n, body: "Quokka-secret note", color: "sky" });
    const noteVideo = await uploaded(s.gia);
    const { note: videoNote } = await createNote(db, s.gia, { updateId: s.n, video: noteVideo, color: "sky" }, videos.store);
    await setReaction(db, s.pia, { updateId: s.n, kind: "heart" });

    const hidden = [s.n, "Zinnia-secret", s.photoId, v.id, updateVideo, "Quokka-secret", videoNote.id, noteVideo, "Pia"];
    const groupWords = ["Neighbors", '"audience"'];

    const halDirect = JSON.stringify([
      await listUpdates(db, s.hal, videos.store, PHOTOS),
      await listNotes(db, s.hal, videos.store),
    ]);
    const giaDirect = JSON.stringify([
      await listUpdates(db, s.gia, videos.store, PHOTOS),
      await listNotes(db, s.gia, videos.store),
    ]);
    for (const text of [...hidden, ...groupWords]) expect(halDirect).not.toContain(text);
    for (const text of hidden) expect(giaDirect).toContain(text);
    for (const text of groupWords) expect(giaDirect).not.toContain(text);

    const slug = s.family.slug;
    const halToken = await sessionFor(s.hal.id);
    const giaToken = await sessionFor(s.gia.id);
    const halFeed = await get(updatesHandler, slug, halToken);
    const giaFeed = await get(updatesHandler, slug, giaToken);
    const halHttp = JSON.stringify([halFeed, await get(notesHandler, slug, halToken)]);
    const giaHttp = JSON.stringify([giaFeed, await get(notesHandler, slug, giaToken)]);
    for (const text of [...hidden, ...groupWords]) expect(halHttp).not.toContain(text);
    // The handlers use the real video host, which the SDK configured before this file could set
    // CLOUDINARY_URL, so its video links are "unavailable" here. The direct calls above check the
    // video ids; the update and note ids stand in for them here.
    const linked = hidden.filter((text) => text !== updateVideo && text !== noteVideo);
    for (const text of linked) expect(giaHttp).toContain(text);
    for (const text of groupWords) expect(giaHttp).not.toContain(text);
    expect(halFeed.defaults).toBeNull();
    expect(giaFeed.defaults).toBeNull();
  });
});

describe("family members see every audience", () => {
  it("labels each update's audience for family members, with the family's groups for the post form", async () => {
    const s = await setUp();
    const neighbors = { id: s.neighbors.id, name: "Neighbors" };
    const investors = { id: s.investors.id, name: "Investors" };
    const audiences = Object.fromEntries((await listUpdates(db, s.ana)).map((u) => [u.id, u.audience]));
    expect(audiences).toEqual({
      [s.e]: "everyone",
      [s.n]: { groups: [neighbors] },
      [s.ni]: { groups: [investors, neighbors] },
      [s.f]: { groups: [] },
    });

    const anaFeed = await get(updatesHandler, s.family.slug, await sessionFor(s.ana.id));
    expect(anaFeed.defaults).toEqual({ allowNotesByDefault: true, groups: [investors, neighbors] });
    const feed = anaFeed.updates as { id: string; audience: unknown }[];
    expect(Object.fromEntries(feed.map((u) => [u.id, u.audience]))).toEqual(audiences);
  });
});

describe("posting and editing an audience", () => {
  async function groupsOf(updateId: string) {
    const update = await db.update.findUniqueOrThrow({ where: { id: updateId }, include: { groups: true } });
    return { audience: update.audience, groupIds: update.groups.map((g) => g.groupId).sort() };
  }

  it("posts a text or video update to a group", async () => {
    const s = await setUp();
    const posted = await createUpdate(db, s.ana, { body: "For the neighbors", audience: { groups: [s.neighbors.id] } });
    expect(await groupsOf(posted.id)).toEqual({ audience: "groups", groupIds: [s.neighbors.id] });
    expect(await seen(s.gia)).toContain(posted.id);
    expect(await seen(s.hal)).not.toContain(posted.id);

    const videos = fakeVideoStore();
    const video = await uploadedVideo(videos, s.ana);
    const v = await createUpdate(db, s.ana, { video, audience: { groups: [s.neighbors.id] } }, undefined, PHOTOS, videos.store);
    expect(await groupsOf(v.id)).toEqual({ audience: "groups", groupIds: [s.neighbors.id] });
    expect(await seen(s.gia)).toContain(v.id);
    expect(await seen(s.hal)).not.toContain(v.id);

    const everyone = await createUpdate(db, s.ana, { body: "For all", audience: "everyone" });
    expect(await groupsOf(everyone.id)).toEqual({ audience: "everyone", groupIds: [] });
    expect(await seen(s.ned)).toContain(everyone.id);
  });

  it("refuses an empty list, a non-list, and a repeated group", async () => {
    const s = await setUp();
    const before = await db.update.count();
    for (const audience of [{ groups: [] }, { groups: s.neighbors.id }, "groups", { groups: [s.neighbors.id, s.neighbors.id] }]) {
      await expect(createUpdate(db, s.ana, { body: "Hi", audience })).rejects.toMatchObject({ status: 400 });
      await expect(editUpdate(db, s.ana, s.e, { body: "Hi", audience })).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.update.count()).toBe(before);
    expect(await groupsOf(s.e)).toEqual({ audience: "everyone", groupIds: [] });
  });

  it("keeps the audience when an edit doesn't name one, and changes it when it does", async () => {
    const s = await setUp();
    await editUpdate(db, s.ana, s.f, { body: "Still family only" });
    expect(await groupsOf(s.f)).toEqual({ audience: "groups", groupIds: [] });

    await editUpdate(db, s.ana, s.ni, { body: "Now for everyone", audience: "everyone" });
    expect(await groupsOf(s.ni)).toEqual({ audience: "everyone", groupIds: [] });
    expect(await seen(s.ned)).toContain(s.ni);
    expect(await seen(s.uma)).toContain(s.ni);

    await editUpdate(db, s.ana, s.ni, { body: "Now for the neighbors", audience: { groups: [s.neighbors.id] } });
    expect(await groupsOf(s.ni)).toEqual({ audience: "groups", groupIds: [s.neighbors.id] });
    expect(await seen(s.hal)).not.toContain(s.ni);
    expect(await seen(s.gia)).toContain(s.ni);
  });

  it("lets only family members set an audience", async () => {
    const s = await setUp();
    const audience = { groups: [s.neighbors.id] };
    await expect(createUpdate(db, s.gia, { body: "Hi", audience })).rejects.toMatchObject({ status: 403 });
    await expect(editUpdate(db, s.gia, s.e, { body: "Hi", audience })).rejects.toMatchObject({ status: 403 });
    expect(await groupsOf(s.e)).toEqual({ audience: "everyone", groupIds: [] });
  });

  it("refuses another family's group, and stores or changes nothing", async () => {
    const s = await setUp();
    expect(await db.group.count({ where: { id: s.okaforNeighbors.id } })).toBe(1);
    const gone = { status: 409, message: GROUP_GONE };
    const before = await db.update.count();
    for (const groups of [[s.okaforNeighbors.id], [s.neighbors.id, s.okaforNeighbors.id]]) {
      expect(await refusal(createUpdate(db, s.ana, { body: "Hi", audience: { groups } }))).toEqual(gone);
      expect(await refusal(editUpdate(db, s.ana, s.n, { body: "Changed", audience: { groups } }))).toEqual(gone);
    }
    expect(await db.update.count()).toBe(before);
    expect(await groupsOf(s.n)).toEqual({ audience: "groups", groupIds: [s.neighbors.id] });
    const n = await db.update.findUniqueOrThrow({ where: { id: s.n } });
    expect(n.editedAt).toBeNull();
    expect(n.body).toContain("Zinnia-secret");
  });
});

describe("notifications go to the audience only", () => {
  it("emails exactly the people who can see the new update, and never names a group", async () => {
    const s = await setUp();
    await setRemoved(db, s.ana, s.rae.id, true);
    expect((await db.person.findUniqueOrThrow({ where: { id: s.fay.id } })).notificationsOn).toBe(true);
    const neighbors = { groups: [s.neighbors.id] };
    const to = (sent: { to: string }[]) => sent.map((e) => e.to).sort();
    const emails = (...names: string[]) => names.map((n) => (n === "ben" ? s.ben.email! : `${n}@example.com`)).sort();

    const toGroup = fakeMailer();
    await createUpdate(db, s.ana, { body: "For the neighbors", audience: neighbors }, toGroup.sendMany);
    expect(to(toGroup.sent)).toEqual(emails("ben", "gia", "pia"));

    const toAll = fakeMailer();
    await createUpdate(db, s.ana, { body: "For everyone" }, toAll.sendMany);
    expect(to(toAll.sent)).toEqual(emails("ben", "gia", "pia", "hal"));

    const videos = fakeVideoStore();
    const video = await uploadedVideo(videos, s.ana);
    const toGroupVideo = fakeMailer();
    await createUpdate(db, s.ana, { video, audience: neighbors }, toGroupVideo.sendMany, PHOTOS, videos.store);
    expect(to(toGroupVideo.sent)).toEqual(emails("ben", "gia", "pia"));

    // Edits never take a sender: widening N to everyone emails no one.
    const widened = fakeMailer();
    await editUpdate(db, s.ana, s.n, { body: "Now for everyone", audience: "everyone" });
    expect(widened.sent).toEqual([]);

    for (const email of [...toGroup.sent, ...toAll.sent, ...toGroupVideo.sent]) {
      for (const name of ["Neighbors", "Investors"]) {
        expect(email.subject).not.toContain(name);
        expect(email.text).not.toContain(name);
      }
    }
  });
});

describe("the rule and its inverse agree", () => {
  it("lists an update for a person exactly when the person matches canSeeUpdate for it", async () => {
    const s = await setUp();
    const videos = fakeVideoStore();
    const v = await createUpdate(db, s.ana, { video: await uploadedVideo(videos, s.ana), audience: { groups: [s.neighbors.id] } }, undefined, PHOTOS, videos.store);
    await setRemoved(db, s.ana, s.rae.id, true);
    // Hal in Okafor's group, and N shared with it too: grants nothing either way.
    await db.groupMember.create({ data: { groupId: s.okaforNeighbors.id, personId: s.hal.id } });
    await db.updateGroup.create({ data: { updateId: s.n, groupId: s.okaforNeighbors.id } });

    // Stale Person rows for Fay and Rae, from before their removal.
    const cast = [s.ana, s.ben, s.fay, s.chidi, s.gia, s.pia, s.hal, s.uma, s.rae, s.ned, s.olu];
    const updates = [s.e, s.n, s.ni, s.f, s.o, v.id];
    let checked = 0;
    for (const updateId of updates) {
      const loaded = await db.update.findUniqueOrThrow({ where: { id: updateId }, include: { groups: true } });
      const matching = await db.person.findMany({
        where: canSeeUpdate({ familyId: loaded.familyId, audience: loaded.audience, groupIds: loaded.groups.map((g) => g.groupId) }),
        select: { id: true },
      });
      const matches = new Set(matching.map((p) => p.id));
      for (const person of cast) {
        const listed = (await seen(person)).includes(updateId);
        expect({ person: person.name, updateId, listed }).toEqual({ person: person.name, updateId, listed: matches.has(person.id) });
        checked++;
      }
    }
    expect(checked).toBe(cast.length * updates.length);
  });
});

describe("promotion", () => {
  it("takes a promoted supporter out of every group", async () => {
    const s = await setUp();
    await db.groupMember.create({ data: { groupId: s.investors.id, personId: s.gia.id } });
    expect(await db.groupMember.count({ where: { personId: s.gia.id } })).toBe(2);
    const result = await addFamilyMember(db, fakeMailer().send, s.ana, { name: "Gia Rivera", email: "gia@example.com" });
    expect(result.outcome).toBe("promoted");
    expect(await db.groupMember.count({ where: { personId: s.gia.id } })).toBe(0);
    expect(await db.groupMember.count({ where: { personId: s.pia.id } })).toBe(1);
    const promoted = await db.person.findUniqueOrThrow({ where: { id: s.gia.id } });
    expect(await seen(promoted)).toEqual(sorted(s.e, s.n, s.ni, s.f));
  });
});
