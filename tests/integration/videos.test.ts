import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import videoHandler from "../../api/f/[slug]/notes/video.js";
import { getDb } from "../../server/db.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { createNote, deleteNote, issueVideoUpload, listNotes } from "../../server/notes.js";
import { setRemoved } from "../../server/people.js";
import { createUpdate, deleteUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { fakeMailer, fakeVideoStore, joinWithEmail, makeFamily, queuedOrDone, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The Rivera family (Ana) with supporters Sam and Tess and an update, and the Okafor family
// (Chidi) with supporter Olu and an update of their own.
async function setUp() {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const sam = await joinWithEmail(db, family, "Sam");
  const tess = await joinWithEmail(db, family, "Tess");
  const olu = await joinWithEmail(db, okafor, "Olu");
  const update = await createUpdate(db, ana!, { body: "Rivera news" });
  const okaforUpdate = await createUpdate(db, chidi!, { body: "Okafor news" });
  const videos = fakeVideoStore();
  return {
    family, ana: ana!, chidi: chidi!, sam: sam.person, samToken: sam.sessionToken, tess: tess.person,
    olu: olu.person, oluToken: olu.sessionToken, update, okaforUpdate, videos,
  };
}

type Videos = ReturnType<typeof fakeVideoStore>;

// Gets a ticket for the person and "uploads" a video of the given length under it.
async function upload(videos: Videos, person: Person, seconds = 30) {
  const { publicId } = await issueVideoUpload(db, person, videos.store);
  videos.videos.set(publicId, seconds);
  return publicId;
}

function attach(videos: Videos, person: Person, updateId: string, video: string, extra: Record<string, unknown> = {}) {
  return createNote(db, person, { updateId, video, color: "rose", ...extra }, videos.store);
}

// Calls to the video host other than signing uploads.
const hostCalls = (videos: Videos) => videos.calls.filter((c) => c.method !== "uploadParams");

describe("upload tickets", () => {
  it("gives a removed person no ticket", async () => {
    const { ana, sam, videos } = await setUp();
    await setRemoved(db, ana, sam.id, true);
    await expect(issueVideoUpload(db, sam, videos.store)).rejects.toMatchObject({ status: 403 });
    expect(await db.videoUpload.count()).toBe(0);
  });

  it("refuses a 21st ticket within an hour, used or not", async () => {
    const { sam, tess, update, videos } = await setUp();
    const first = await upload(videos, sam);
    await attach(videos, sam, update.id, first);
    for (let i = 0; i < 19; i++) await issueVideoUpload(db, sam, videos.store);
    await expect(issueVideoUpload(db, sam, videos.store)).rejects.toMatchObject({ status: 429 });
    // Counted per person.
    await issueVideoUpload(db, tess, videos.store);
  });

  it("issues unguessable public IDs under the deployment's folder", async () => {
    const { sam, videos } = await setUp();
    const a = await upload(videos, sam);
    const b = await upload(videos, sam);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^updates-and-support\/dev\/[A-Za-z0-9_-]{22}$/);
  });
});

describe("attaching a video", () => {
  it("attaches a ticketed video as a note with signed links and no body", async () => {
    const { sam, update, videos } = await setUp();
    const publicId = await upload(videos, sam);
    const { note } = await attach(videos, sam, update.id, publicId);
    expect(note.body).toBe("");
    expect(note.video).toEqual(videos.store.urls(publicId));
    expect(await db.note.findUniqueOrThrow({ where: { id: note.id } })).toMatchObject({ videoId: publicId, body: "" });
  });

  it("refuses another person's ticket, in this family or another, without asking the host", async () => {
    const { sam, tess, olu, update, okaforUpdate, videos } = await setUp();
    const samsVideo = await upload(videos, sam);
    const calls = hostCalls(videos).length;
    await expect(attach(videos, tess, update.id, samsVideo)).rejects.toMatchObject({ status: 400 });
    await expect(attach(videos, olu, okaforUpdate.id, samsVideo)).rejects.toMatchObject({ status: 400 });
    expect(hostCalls(videos)).toHaveLength(calls);
    expect(await db.note.count()).toBe(0);
  });

  it("refuses a public ID it never issued, without asking the host", async () => {
    const { sam, update, videos } = await setUp();
    // Such as another project's video in the shared host.
    videos.videos.set("other-project/clip", 10);
    await expect(attach(videos, sam, update.id, "other-project/clip")).rejects.toMatchObject({ status: 400 });
    await expect(attach(videos, sam, update.id, 42 as unknown as string)).rejects.toMatchObject({ status: 400 });
    expect(hostCalls(videos)).toHaveLength(0);
    expect(videos.videos.has("other-project/clip")).toBe(true);
  });

  it("won't attach a person's own video to another family's update", async () => {
    const { sam, okaforUpdate, videos } = await setUp();
    const publicId = await upload(videos, sam);
    await expect(attach(videos, sam, okaforUpdate.id, publicId)).rejects.toMatchObject({ status: 404 });
    expect(await db.note.count()).toBe(0);
  });

  it("attaches a ticket's video to one note only", async () => {
    const { sam, update, videos } = await setUp();
    const publicId = await upload(videos, sam);
    await attach(videos, sam, update.id, publicId);
    await expect(attach(videos, sam, update.id, publicId)).rejects.toMatchObject({ status: 400 });
    expect(await db.note.count()).toBe(1);
  });

  it("refuses a video that isn't there or runs over 60 seconds, leaving it in place", async () => {
    const { sam, update, videos } = await setUp();
    // describe returns null for anything that isn't an authenticated video, uploaded or not.
    const missing = (await issueVideoUpload(db, sam, videos.store)).publicId;
    await expect(attach(videos, sam, update.id, missing)).rejects.toMatchObject({ status: 400 });
    const long = await upload(videos, sam, 61.5);
    await expect(attach(videos, sam, update.id, long)).rejects.toMatchObject({ status: 400 });
    expect(videos.calls.some((c) => c.method === "destroy")).toBe(false);
    // A second of grace for how containers round.
    await attach(videos, sam, update.id, await upload(videos, sam, 60.9));
    expect(await db.note.count()).toBe(1);
  });

  it("refuses a body and a video together", async () => {
    const { sam, update, videos } = await setUp();
    const publicId = await upload(videos, sam);
    await expect(attach(videos, sam, update.id, publicId, { body: "Hello" })).rejects.toMatchObject({ status: 400 });
    expect(await db.note.count()).toBe(0);
  });

  it("refuses a removed person's ticket", async () => {
    const { ana, sam, update, videos } = await setUp();
    const publicId = await upload(videos, sam);
    await setRemoved(db, ana, sam.id, true);
    await expect(attach(videos, sam, update.id, publicId)).rejects.toMatchObject({ status: 403 });
  });

  it("counts video notes toward the shared 20 an hour", async () => {
    const { sam, update, videos } = await setUp();
    for (let i = 0; i < 10; i++) await attach(videos, sam, update.id, await upload(videos, sam));
    for (let i = 0; i < 10; i++) await createNote(db, sam, { updateId: update.id, body: `Note ${i}`, color: "sky" }, videos.store);
    // Under the ticket limit (11 of 20), so it's the note limit that refuses.
    await expect(attach(videos, sam, update.id, await upload(videos, sam))).rejects.toMatchObject({ status: 429 });
  });
});

describe("who sees a video", () => {
  it("never sends another family a video note or its links", async () => {
    const { sam, olu, update, videos } = await setUp();
    const publicId = await upload(videos, sam);
    await attach(videos, sam, update.id, publicId);
    const theirs = JSON.stringify([await listNotes(db, olu, videos.store), await listUpdates(db, olu, videos.store)]);
    expect(theirs).not.toContain(publicId);
    expect(theirs).not.toContain("videos.example.test");
  });

  it("hides a removed author's video and its links everywhere until they're restored", async () => {
    const { ana, sam, update, videos } = await setUp();
    const publicId = await upload(videos, sam);
    await attach(videos, sam, update.id, publicId);
    await setRemoved(db, ana, sam.id, true);
    const hidden = JSON.stringify([await listNotes(db, ana, videos.store), await listUpdates(db, ana, videos.store)]);
    expect(hidden).not.toContain("videos.example.test");
    await setRemoved(db, ana, sam.id, false);
    const shown = JSON.stringify(await listNotes(db, ana, videos.store));
    expect(shown).toContain(`videos.example.test/${publicId}.mp4`);
  });
});

describe("when the video host is misconfigured", () => {
  it("still shows the feed and the wall, with the video marked unavailable", async () => {
    const { ana, sam, update, videos } = await setUp();
    await attach(videos, sam, update.id, await upload(videos, sam));
    await createNote(db, sam, { updateId: update.id, body: "Written", color: "sky" }, videos.store);
    videos.misconfigure(true);
    const feed = (await listUpdates(db, ana, videos.store)).find((u) => u.id === update.id)!;
    expect(feed.notes.map((n) => n.video)).toEqual([null, { unavailable: true }]);
    expect((await listNotes(db, ana, videos.store)).map((n) => n.video)).toEqual([null, { unavailable: true }]);
  });

  it("refuses tickets and attaching with a 503, using up no ticket", async () => {
    const { sam, update, videos } = await setUp();
    const { publicId } = await issueVideoUpload(db, sam, videos.store);
    videos.videos.set(publicId, 10);
    videos.misconfigure(true);
    await expect(issueVideoUpload(db, sam, videos.store)).rejects.toMatchObject({ status: 503 });
    expect(await db.videoUpload.count()).toBe(1);
    await expect(attach(videos, sam, update.id, publicId)).rejects.toMatchObject({ status: 503 });
    expect(await db.note.count()).toBe(0);
  });
});

describe("deleting a video note", () => {
  it("lets only the author or a family member of this family delete it, destroying the video", async () => {
    const { ana, chidi, sam, tess, olu, update, videos } = await setUp();
    const publicId = await upload(videos, sam);
    const { note } = await attach(videos, sam, update.id, publicId);
    for (const person of [tess, olu, chidi]) {
      await expect(deleteNote(db, person, note.id, videos.store)).rejects.toMatchObject({ status: 404 });
    }
    expect(videos.calls.some((c) => c.method === "destroy")).toBe(false);
    expect(videos.videos.has(publicId)).toBe(true);

    await deleteNote(db, ana, note.id, videos.store);
    expect(videos.videos.has(publicId)).toBe(false);
    expect(await db.note.count()).toBe(0);

    const own = await upload(videos, sam);
    const { note: second } = await attach(videos, sam, update.id, own);
    await deleteNote(db, sam, second.id, videos.store);
    expect(videos.videos.has(own)).toBe(false);
  });

  it("keeps the note when the host can't delete the video, so it can be tried again", async () => {
    const { sam, update, videos } = await setUp();
    const publicId = await upload(videos, sam);
    const { note } = await attach(videos, sam, update.id, publicId);
    videos.failDestroy(true);
    await expect(deleteNote(db, sam, note.id, videos.store)).rejects.toMatchObject({ status: 502 });
    expect(await db.note.count()).toBe(1);
    videos.failDestroy(false);
    await deleteNote(db, sam, note.id, videos.store);
    expect(await db.note.count()).toBe(0);
  });

  it("destroys every video on a deleted update, including a removed author's", async () => {
    const { ana, sam, tess, update, videos } = await setUp();
    const samsVideo = await upload(videos, sam);
    const tesssVideo = await upload(videos, tess);
    await attach(videos, sam, update.id, samsVideo);
    await attach(videos, tess, update.id, tesssVideo);
    await setRemoved(db, ana, tess.id, true);

    videos.failDestroy(true);
    await expect(deleteUpdate(db, ana, update.id, videos.store)).rejects.toMatchObject({ status: 502 });
    expect(await db.note.count()).toBe(2);

    videos.failDestroy(false);
    await deleteUpdate(db, ana, update.id, videos.store);
    expect(videos.videos.size).toBe(0);
    expect(await db.note.count()).toBe(0);
  });

  it("leaves no video behind when one is attached while its update is being deleted", async () => {
    const { ana, sam, update, videos } = await setUp();
    await attach(videos, sam, update.id, await upload(videos, sam));
    const racing = await upload(videos, sam);

    // The deletion pauses while the host deletes the first video; the attach starts then.
    const release = videos.holdDestroy();
    const deletion = deleteUpdate(db, ana, update.id, videos.store);
    while (!videos.calls.some((c) => c.method === "destroy")) await new Promise((r) => setTimeout(r, 5));
    const attaching = attach(videos, sam, update.id, racing);
    await queuedOrDone(db, attaching, "transactionid");
    release();

    await deletion;
    const outcome = await attaching.then(() => "attached", (err) => err);
    // Either the attach was refused, or its video went with the update.
    if (outcome === "attached") expect(videos.videos.has(racing)).toBe(false);
    else expect(outcome).toMatchObject({ status: 404 });
    expect(await db.note.count()).toBe(0);
  });
});

const MAX_BYTES = 100 * 1024 * 1024;

function postVideo(videos: Videos, person: Person, video: string, extra: Record<string, unknown> = {}) {
  return createUpdate(db, person, { video, ...extra }, undefined, undefined, videos.store);
}

describe("video updates", () => {
  it("posts with a chosen set of reactions, which can't be edited later", async () => {
    const { ana, videos } = await setUp();
    const update = await postVideo(videos, ana, await upload(videos, ana), { reactions: ["candle", "heart"] });
    expect(await db.update.findUniqueOrThrow({ where: { id: update.id } })).toMatchObject({ reactionKinds: ["heart", "candle"] });
    await expect(editUpdate(db, ana, update.id, { reactions: ["skull"] })).rejects.toMatchObject({ status: 400 });
    await expect(postVideo(videos, ana, await upload(videos, ana), { reactions: ["nope"] })).rejects.toMatchObject({ status: 400 });
  });

  it("posts a video of any length, and only this family sees its links", async () => {
    const { ana, sam, olu, videos } = await setUp();
    const publicId = await upload(videos, ana, 600);
    const update = await postVideo(videos, ana, publicId);
    expect(update.body).toBe("[Video]");
    expect(update.video).toEqual(videos.store.urls(publicId));
    expect(await db.update.findUniqueOrThrow({ where: { id: update.id } })).toMatchObject({
      videoId: publicId,
      body: "[Video]",
      content: null,
    });

    const sams = JSON.stringify(await listUpdates(db, sam, videos.store));
    expect(sams).toContain(`videos.example.test/${publicId}.mp4`);
    const olus = JSON.stringify(await listUpdates(db, olu, videos.store));
    expect(olus).not.toContain(publicId);
    expect(olus).not.toContain("videos.example.test");
  });

  it("refuses a supporter, without asking the host", async () => {
    const { sam, videos } = await setUp();
    const publicId = await upload(videos, sam);
    const calls = hostCalls(videos).length;
    await expect(postVideo(videos, sam, publicId)).rejects.toMatchObject({ status: 403 });
    expect(hostCalls(videos)).toHaveLength(calls);
    expect(await db.update.count({ where: { videoId: publicId } })).toBe(0);
  });

  it("refuses another person's ticket, in this family or another, without asking the host", async () => {
    const { ana, chidi, videos } = await setUp();
    const anas = await upload(videos, ana);
    const calls = hostCalls(videos).length;
    await expect(postVideo(videos, chidi, anas)).rejects.toMatchObject({ status: 400 });
    expect(hostCalls(videos)).toHaveLength(calls);
    expect(await db.update.count({ where: { videoId: anas } })).toBe(0);
  });

  it("refuses a removed family member", async () => {
    const { ana, videos } = await setUp();
    const publicId = await upload(videos, ana);
    await db.person.update({ where: { id: ana.id }, data: { removedAt: new Date() } });
    await expect(postVideo(videos, ana, publicId)).rejects.toMatchObject({ status: 403 });
    expect(await db.update.count({ where: { videoId: publicId } })).toBe(0);
  });

  it("attaches a ticket once, and not to both a note and an update", async () => {
    const { ana, update, videos } = await setUp();
    const onNote = await upload(videos, ana);
    await attach(videos, ana, update.id, onNote);
    await expect(postVideo(videos, ana, onNote)).rejects.toMatchObject({ status: 400 });

    const onUpdate = await upload(videos, ana);
    await postVideo(videos, ana, onUpdate);
    await expect(postVideo(videos, ana, onUpdate)).rejects.toMatchObject({ status: 400 });
    await expect(attach(videos, ana, update.id, onUpdate)).rejects.toMatchObject({ status: 400 });
    expect(videos.videos.has(onUpdate)).toBe(true);
    expect(await db.note.count({ where: { videoId: onUpdate } })).toBe(0);
  });

  it("refuses a video that isn't there or is over 100 MB, and accepts one of any length at 100 MB", async () => {
    const { ana, videos } = await setUp();
    const missing = (await issueVideoUpload(db, ana, videos.store)).publicId;
    await expect(postVideo(videos, ana, missing)).rejects.toMatchObject({ status: 400 });

    const huge = await upload(videos, ana, 30);
    videos.setBytes(huge, MAX_BYTES + 1);
    await expect(postVideo(videos, ana, huge)).rejects.toMatchObject({ status: 400 });
    expect(videos.calls.some((c) => c.method === "destroy")).toBe(false);
    expect(videos.videos.has(huge)).toBe(true);

    const full = await upload(videos, ana, 3_600);
    videos.setBytes(full, MAX_BYTES);
    await postVideo(videos, ana, full);
    expect(await db.update.count({ where: { videoId: full } })).toBe(1);
  });

  it("refuses text and a video together", async () => {
    const { ana, videos } = await setUp();
    const publicId = await upload(videos, ana);
    await expect(postVideo(videos, ana, publicId, { body: "Hello" })).rejects.toMatchObject({ status: 400 });
    expect(await db.update.count({ where: { videoId: publicId } })).toBe(0);
  });

  it("refuses to edit a video update", async () => {
    const { ana, videos } = await setUp();
    const publicId = await upload(videos, ana);
    const update = await postVideo(videos, ana, publicId);
    await expect(editUpdate(db, ana, update.id, { body: "Changed" }, undefined, videos.store)).rejects.toMatchObject({
      status: 400,
    });
    expect(await db.update.findUniqueOrThrow({ where: { id: update.id } })).toMatchObject({
      videoId: publicId,
      body: "[Video]",
      editedAt: null,
    });
  });

  it("destroys the video before removing the update, and keeps the update if that fails", async () => {
    const { ana, videos } = await setUp();
    const publicId = await upload(videos, ana);
    const update = await postVideo(videos, ana, publicId);
    videos.failDestroy(true);
    await expect(deleteUpdate(db, ana, update.id, videos.store)).rejects.toMatchObject({ status: 502 });
    expect(await db.update.count({ where: { id: update.id } })).toBe(1);
    expect(videos.videos.has(publicId)).toBe(true);

    videos.failDestroy(false);
    await deleteUpdate(db, ana, update.id, videos.store);
    expect(videos.videos.has(publicId)).toBe(false);
    expect(await db.update.count({ where: { id: update.id } })).toBe(0);
  });

  it("says the email is a video, and never names the video", async () => {
    const { ana, sam, videos } = await setUp();
    await db.person.update({ where: { id: sam.id }, data: { emailVerifiedAt: new Date() } });
    const publicId = await upload(videos, ana);
    const mail = fakeMailer();
    await createUpdate(db, ana, { video: publicId }, mail.sendMany, undefined, videos.store);
    expect(mail.sent.map((e) => e.subject)).toEqual(["The Rivera Family has a new update (video)"]);
    for (const part of [mail.sent[0]!.subject, mail.sent[0]!.text]) {
      expect(part).not.toContain(publicId);
      expect(part).not.toContain("videos.example");
    }
  });

  it("keeps the update when the emails fail", async () => {
    const { ana, videos } = await setUp();
    const publicId = await upload(videos, ana);
    const failing = async () => {
      throw new Error("Resend is down");
    };
    await createUpdate(db, ana, { video: publicId }, failing, undefined, videos.store);
    expect(await db.update.count({ where: { videoId: publicId } })).toBe(1);
  });

  it("still shows the feed when the host can't make links, and refuses a new video", async () => {
    const { ana, videos } = await setUp();
    const posted = await upload(videos, ana);
    const update = await postVideo(videos, ana, posted);
    const next = await upload(videos, ana);
    videos.misconfigure(true);
    const feed = await listUpdates(db, ana, videos.store);
    expect(feed.find((u) => u.id === update.id)!.video).toEqual({ unavailable: true });
    await expect(postVideo(videos, ana, next)).rejects.toMatchObject({ status: 503 });
    expect(await db.update.count({ where: { videoId: next } })).toBe(0);
  });
});

describe("the ticket endpoint", () => {
  const savedUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  });
  afterAll(async () => {
    await getDb().$disconnect();
    process.env.DATABASE_URL = savedUrl;
  });

  async function call(method: string, query: Record<string, string>, cookies: Record<string, string>) {
    const req = { method, query, headers: {}, cookies };
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
    await videoHandler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    return res.statusCode;
  }

  it("refuses anyone without this family's session, a wrong method, or an unknown family", async () => {
    const { family, oluToken, samToken } = await setUp();
    const slug = family.slug;
    // Under this family's cookie name, so the handler reads it and the family check refuses it.
    for (const cookies of [{}, { [`session_${slug}`]: oluToken }]) {
      expect(await call("POST", { slug }, cookies)).toBe(401);
    }
    const samCookie = { [`session_${slug}`]: samToken };
    expect(await call("GET", { slug }, samCookie)).toBe(405);
    expect(await call("POST", { slug: "no-such-family" }, samCookie)).toBe(404);
    expect(await db.videoUpload.count()).toBe(0);
  });
});
