import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import photoHandler from "../../api/f/[slug]/photo-upload.js";
import updatesHandler from "../../api/f/[slug]/updates/index.js";
import type { Doc } from "../../src/lib/doc.js";
import { photoUrl, signParams } from "../../server/cloudinary.js";
import { getDb } from "../../server/db.js";
import { setRemoved } from "../../server/people.js";
import type { PhotoSettings } from "../../server/photoSettings.js";
import { textOf } from "../../server/richText.js";
import { hashToken, newToken } from "../../server/tokens.js";
import { createUpdate, deleteUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { fakeMailer, joinWithEmail, makeFamily, queuedOrDone, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const CLOUD = { cloudName: "demo", apiKey: "1234", apiSecret: "abcd" };

function idFor(familyId: string, n: number) {
  return `families/${familyId}/${String(n).padEnd(22, "a")}`;
}

function paragraph(text: string): Doc["content"][number] {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function textDoc(text: string): Doc {
  return { type: "doc", content: [paragraph(text)] };
}

function shot(publicId: string, caption = ""): Doc["content"][number] {
  return { type: "photo", attrs: { caption, publicId } };
}

function grey(caption: string): Doc["content"][number] {
  return { type: "photo", attrs: { caption, placeholder: true } };
}

function album(...content: Doc["content"]): Doc {
  return { type: "doc", content };
}

function recorder(extra: Partial<PhotoSettings> = {}) {
  const destroyed: string[][] = [];
  const settings: PhotoSettings = {
    placeholders: false,
    cloudinary: CLOUD,
    destroy: async (ids) => {
      destroyed.push(ids);
    },
    ...extra,
  };
  return { settings, destroyed };
}

async function setUp() {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const sam = await joinWithEmail(db, family, "Sam");
  const olu = await joinWithEmail(db, okafor, "Olu");
  return {
    family,
    okafor,
    ana: ana!,
    chidi: chidi!,
    sam: sam.person,
    samToken: sam.sessionToken,
    oluToken: olu.sessionToken,
  };
}

async function sessionFor(personId: string) {
  const token = newToken();
  await db.session.create({
    data: { personId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}

describe("attaching real photos", () => {
  it("stores a photo the family was issued and signs a transformed link for people who can read", async () => {
    const { family, ana, sam, chidi } = await setUp();
    const { settings } = recorder();
    const publicId = idFor(family.id, 1);
    const content = album(paragraph("Before"), shot(publicId, "Picnic"), paragraph("After"));
    await createUpdate(db, ana, { content }, undefined, settings);

    const [seen] = await listUpdates(db, sam, undefined, settings);
    expect(seen!.content).toEqual(
      album(paragraph("Before"), { type: "photo", attrs: { caption: "Picnic", publicId, url: photoUrl(CLOUD, publicId) } }, paragraph("After")),
    );
    expect(seen!.body).toBe("Before\n\n[Photo: Picnic]\n\nAfter");
    const row = await db.photo.findFirstOrThrow();
    expect(row).toMatchObject({ publicId, updateId: seen!.id });
    expect((await db.update.findUniqueOrThrow({ where: { id: seen!.id } })).content).toEqual(content);

    const theirs = JSON.stringify(await listUpdates(db, chidi, undefined, settings));
    expect(theirs).not.toContain(publicId);
    expect(theirs).not.toContain("Picnic");
    expect(theirs).not.toContain("res.cloudinary.com");
  });

  it("gives no link for a photo row that isn't this update's, including one inserted for another family", async () => {
    const { family, okafor, ana, chidi } = await setUp();
    const { settings } = recorder();
    const kept = idFor(family.id, 1);
    const update = await createUpdate(db, ana, { content: album(paragraph("Before"), shot(kept, "Picnic")) }, undefined, settings);
    const missing = idFor(family.id, 2);
    const foreign = idFor(okafor.id, 3);
    await db.photo.create({ data: { updateId: update.id, publicId: foreign } });
    const content = album(paragraph("Before"), shot(kept, "Picnic"), shot(missing, "Extra"), shot(foreign, "Other family"));
    await db.update.update({ where: { id: update.id }, data: { content, body: textOf(content) } });

    const [seen] = await listUpdates(db, ana, undefined, settings);
    const photos = seen!.content.content.filter((node) => node.type === "photo");
    expect(photos.map((node) => ("url" in node.attrs ? node.attrs.url : null))).toEqual([photoUrl(CLOUD, kept), null, null]);
    const listed = JSON.stringify(seen);
    expect(listed).not.toContain(photoUrl(CLOUD, missing));
    expect(listed).not.toContain(photoUrl(CLOUD, foreign));
    const theirs = JSON.stringify(await listUpdates(db, chidi, undefined, settings));
    expect(theirs).not.toContain(foreign);
    expect(theirs).not.toContain("Other family");
    expect(theirs).not.toContain(kept);
  });

  it("refuses another family's id, a tampered id, a duplicate, a seventh, and a new id while photos are off", async () => {
    const { family, okafor, ana } = await setUp();
    const { settings } = recorder();
    const good = idFor(family.id, 1);
    const bad = [
      idFor(okafor.id, 1),
      `families/${family.id}/${"a".repeat(22)}/extra`,
      `families/${family.id}/${"a".repeat(21)}`,
      `families/${family.id}/families/${okafor.id}`,
      "not-a-photo",
    ];
    for (const publicId of bad) {
      await expect(createUpdate(db, ana, { content: album(shot(publicId)) }, undefined, settings)).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      createUpdate(db, ana, { content: album(shot(good), shot(good)) }, undefined, settings),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createUpdate(
        db,
        ana,
        { content: album(...Array.from({ length: 7 }, (_, i) => shot(idFor(family.id, i + 1)))) },
        undefined,
        settings,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(createUpdate(db, ana, { content: album(shot(good)) }, undefined, { placeholders: false, cloudinary: null })).rejects.toMatchObject({
      status: 400,
    });
    expect(await db.update.count()).toBe(0);
    expect(await db.photo.count()).toBe(0);
  });

  it("refuses a photo that is already on another update, on post and on edit, and leaves it where it was", async () => {
    const { family, ana } = await setUp();
    const { settings } = recorder();
    const publicId = idFor(family.id, 1);
    const first = await createUpdate(db, ana, { content: album(shot(publicId, "Picnic")) }, undefined, settings);
    await expect(createUpdate(db, ana, { content: album(shot(publicId)) }, undefined, settings)).rejects.toMatchObject({ status: 409 });
    const second = await createUpdate(db, ana, { content: textDoc("Words") }, undefined, settings);
    await expect(editUpdate(db, ana, second.id, { content: album(shot(publicId)) }, settings)).rejects.toMatchObject({ status: 409 });

    expect(await db.photo.findMany()).toEqual([expect.objectContaining({ publicId, updateId: first.id })]);
    const stored = await db.update.findUniqueOrThrow({ where: { id: second.id } });
    expect(stored.content).toEqual(textDoc("Words"));
    expect(stored.editedAt).toBeNull();
  });

  it("refuses a placeholder when real photos are on and placeholders are off", async () => {
    const { ana } = await setUp();
    const { settings } = recorder();
    await expect(createUpdate(db, ana, { content: album(grey("Picnic")) }, undefined, settings)).rejects.toMatchObject({ status: 400 });
    expect(await db.update.count()).toBe(0);
  });

  it("still accepts a saved placeholder when real photos are also on, and shows it grey", async () => {
    const { family, ana, sam } = await setUp();
    const { settings } = recorder({ placeholders: true });
    const publicId = idFor(family.id, 1);
    await createUpdate(
      db,
      ana,
      { content: album(grey("Old"), shot(publicId, "New")) },
      undefined,
      settings,
    );
    const [seen] = await listUpdates(db, sam, undefined, settings);
    expect(seen!.content.content[0]).toEqual({ type: "photo", attrs: { caption: "Old", placeholder: true, url: null } });
    expect(seen!.content.content[1]).toEqual({ type: "photo", attrs: { caption: "New", publicId, url: photoUrl(CLOUD, publicId) } });
  });

  it("counts a real photo in the subject and leaves the body free of the photo", async () => {
    const { family, ana } = await setUp();
    const { settings } = recorder();
    await db.person.create({
      data: { familyId: family.id, role: "supporter", name: "Sam Friend", email: "sam.notes@example.com", emailVerifiedAt: new Date() },
    });
    const mail = fakeMailer();
    const publicId = idFor(family.id, 1);
    await createUpdate(db, ana, { content: album(paragraph("Hello"), shot(publicId, "Picnic")) }, mail.sendMany, settings);
    const [email] = mail.sent;
    expect(email!.subject).toBe("The Rivera Family has a new update (1 photo)");
    for (const part of [email!.subject, email!.text, JSON.stringify(email!.headers)]) {
      expect(part).not.toContain("Picnic");
      expect(part).not.toContain(publicId);
      expect(part).not.toContain("cloudinary");
    }
  });
});

describe("deleting real photos", () => {
  it("destroys only that update's photos, after the row is gone", async () => {
    const { family, okafor, ana, chidi } = await setUp();
    const destroyed: string[][] = [];
    const settings: PhotoSettings = {
      placeholders: false,
      cloudinary: CLOUD,
      destroy: async (ids) => {
        expect(await db.photo.count({ where: { publicId: { in: ids } } })).toBe(0);
        destroyed.push(ids);
      },
    };
    const riveraId = idFor(family.id, 1);
    const okaforId = idFor(okafor.id, 2);
    const update = await createUpdate(db, ana, { content: album(shot(riveraId)) }, undefined, settings);
    const theirs = await createUpdate(db, chidi, { content: album(shot(okaforId)) }, undefined, settings);

    await expect(deleteUpdate(db, ana, theirs.id, undefined, settings)).rejects.toMatchObject({ status: 404 });
    expect(destroyed).toEqual([]);
    expect(await db.photo.findMany({ where: { updateId: theirs.id } })).toHaveLength(1);

    await deleteUpdate(db, ana, update.id, undefined, settings);
    expect(destroyed).toEqual([[riveraId]]);
    expect(await db.update.findUnique({ where: { id: update.id } })).toBeNull();
    expect(await db.photo.findMany()).toEqual([expect.objectContaining({ publicId: okaforId })]);
  });

  it("still deletes the update when Cloudinary can't delete the photo", async () => {
    const { family, ana } = await setUp();
    const publicId = idFor(family.id, 1);
    const settings: PhotoSettings = {
      placeholders: false,
      cloudinary: CLOUD,
      destroy: async () => {
        throw new Error("Cloudinary unavailable");
      },
    };
    const update = await createUpdate(db, ana, { content: album(shot(publicId, "Picnic")) }, undefined, settings);
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((message) => {
      errors.push(String(message));
    });
    try {
      await deleteUpdate(db, ana, update.id, undefined, settings);
    } finally {
      spy.mockRestore();
    }
    expect(await db.update.count()).toBe(0);
    expect(await db.photo.count()).toBe(0);
    expect(errors.join("\n")).toContain(update.id);
    expect(errors.join("\n")).not.toContain(publicId);
  });

  it("destroys a photo an edit removed, keeps one it didn't, and destroys nothing when the edit fails", async () => {
    const { family, ana } = await setUp();
    const destroyed: string[][] = [];
    const settings: PhotoSettings = {
      placeholders: false,
      cloudinary: CLOUD,
      destroy: async (ids) => {
        expect(await db.photo.count({ where: { publicId: { in: ids } } })).toBe(0);
        destroyed.push([...ids].sort());
      },
    };
    const kept = idFor(family.id, 1);
    const dropped = idFor(family.id, 2);
    const update = await createUpdate(db, ana, { content: album(shot(kept, "Stay"), shot(dropped, "Go")) }, undefined, settings);

    await expect(editUpdate(db, ana, update.id, { content: { type: "nope" } }, settings)).rejects.toMatchObject({ status: 400 });
    expect(destroyed).toEqual([]);
    expect(await db.photo.findMany({ orderBy: { publicId: "asc" } })).toHaveLength(2);

    await editUpdate(db, ana, update.id, { content: album(paragraph("Edited"), shot(kept, "Stay")) }, settings);
    expect(destroyed).toEqual([[dropped]]);
    expect(await db.photo.findMany()).toEqual([expect.objectContaining({ publicId: kept, updateId: update.id })]);
  });

  it("keeps an existing photo when Cloudinary is later turned off", async () => {
    const { family, ana } = await setUp();
    const { settings, destroyed } = recorder();
    const publicId = idFor(family.id, 1);
    const update = await createUpdate(db, ana, { content: album(shot(publicId, "Picnic")) }, undefined, settings);
    const off = { placeholders: false, cloudinary: null };
    const edited = await editUpdate(db, ana, update.id, { content: album(paragraph("Edited"), shot(publicId, "Picnic")) }, off);
    expect(edited.content).toEqual(album(paragraph("Edited"), shot(publicId, "Picnic")));
    expect(await db.photo.findMany()).toEqual([expect.objectContaining({ publicId })]);
    expect(destroyed).toEqual([]);
    const [seen] = await listUpdates(db, ana, undefined, off);
    expect(seen!.content.content[1]).toEqual({ type: "photo", attrs: { caption: "Picnic", publicId, url: null } });
  });

  it("refuses an edit that is waiting while the update is deleted, and does not destroy the photo", async () => {
    const { family, ana } = await setUp();
    const { settings, destroyed } = recorder();
    const publicId = idFor(family.id, 1);
    const update = await createUpdate(db, ana, { content: album(shot(publicId, "Picnic")) }, undefined, settings);

    let editing!: Promise<unknown>;
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Update" WHERE id = ${update.id} FOR UPDATE`;
        editing = editUpdate(db, ana, update.id, { content: textDoc("Just text") }, settings);
        await queuedOrDone(db, editing, "transactionid");
        expect(destroyed).toEqual([]);
        expect(await tx.photo.count()).toBe(1);
        await tx.update.delete({ where: { id: update.id } });
      },
      { timeout: 10_000 },
    );
    await expect(editing).rejects.toMatchObject({ status: 404 });
    expect(destroyed).toEqual([]);
  });
});

describe("the upload endpoint", () => {
  const savedUrl = process.env.DATABASE_URL;
  const savedCloud = process.env.CLOUDINARY_URL;
  const savedPlaceholders = process.env.PHOTO_PLACEHOLDERS;
  const fakeCloud = "cloudinary://1234:abcd-secret@demo";

  beforeAll(() => {
    // Setup loads .env. Override any real Cloudinary URL so signatures use the fake account.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.CLOUDINARY_URL = fakeCloud;
    delete process.env.PHOTO_PLACEHOLDERS;
  });

  afterAll(async () => {
    await getDb().$disconnect();
    restore("DATABASE_URL", savedUrl);
    restore("CLOUDINARY_URL", savedCloud);
    restore("PHOTO_PLACEHOLDERS", savedPlaceholders);
  });

  function restore(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  async function call(
    handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>,
    method: string,
    query: Record<string, string>,
    cookies: Record<string, string>,
    body?: unknown,
  ) {
    const req = {
      method,
      query,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      cookies,
      body,
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
    await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    return res;
  }

  async function familyMember() {
    const setup = await setUp();
    const anaToken = await sessionFor(setup.ana.id);
    return { ...setup, anaToken };
  }

  it("signs a Rivera upload for a family member, and refuses everyone else", async () => {
    const { family, samToken, oluToken, anaToken } = await familyMember();
    const slug = family.slug;
    const cookie = { [`session_${slug}`]: anaToken };
    const first = await call(photoHandler, "POST", { slug }, cookie);
    const second = await call(photoHandler, "POST", { slug }, cookie);
    expect(first.statusCode).toBe(200);
    const ticket = first.body as { publicId: string; url: string; fields: Record<string, string> };
    const again = second.body as { publicId: string };
    expect(ticket.publicId).toMatch(new RegExp(`^families/${family.id}/[A-Za-z0-9_-]{22}$`));
    expect(ticket.publicId).not.toBe(again.publicId);
    expect(ticket.url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    const signed = {
      allowed_formats: ticket.fields.allowed_formats!,
      overwrite: ticket.fields.overwrite!,
      public_id: ticket.fields.public_id!,
      timestamp: ticket.fields.timestamp!,
      transformation: ticket.fields.transformation!,
      type: ticket.fields.type!,
    };
    expect(signed).toEqual({
      allowed_formats: "jpg,png,webp,gif,heic,heif",
      overwrite: "false",
      public_id: ticket.publicId,
      timestamp: signed.timestamp,
      transformation: "c_limit,w_1600,fl_force_strip",
      type: "authenticated",
    });
    expect(ticket.fields.signature).toBe(signParams(signed, "abcd-secret"));
    expect(ticket.fields.api_key).toBe("1234");
    expect(JSON.stringify(first.body)).not.toContain("abcd-secret");

    for (const cookies of [{}, { [`session_${slug}`]: oluToken }]) {
      const refused = await call(photoHandler, "POST", { slug }, cookies);
      expect(refused.statusCode).toBe(401);
      expect(JSON.stringify(refused.body)).not.toContain("cloudinary");
    }
    expect((await call(photoHandler, "POST", { slug }, { [`session_${slug}`]: samToken })).statusCode).toBe(403);
    expect((await call(photoHandler, "GET", { slug }, cookie)).statusCode).toBe(405);
    expect((await call(photoHandler, "POST", { slug: "no-such-family" }, cookie)).statusCode).toBe(404);

    delete process.env.CLOUDINARY_URL;
    try {
      expect((await call(photoHandler, "POST", { slug }, cookie)).statusCode).toBe(404);
    } finally {
      process.env.CLOUDINARY_URL = fakeCloud;
    }
  });

  it("gives a supporter the signed link and a removed supporter nothing", async () => {
    const { family, ana, sam, samToken } = await familyMember();
    const { settings } = recorder();
    const publicId = idFor(family.id, 1);
    await createUpdate(db, ana, { content: album(shot(publicId, "Picnic")) }, undefined, settings);
    // The handler signs with the environment, which is the fake account, not `settings`.
    process.env.CLOUDINARY_URL = "cloudinary://1234:abcd@demo";
    const slug = family.slug;
    try {
      const ok = await call(updatesHandler, "GET", { slug }, { [`session_${slug}`]: samToken });
      expect(ok.statusCode).toBe(200);
      expect(JSON.stringify(ok.body)).toContain(photoUrl(CLOUD, publicId));

      await setRemoved(db, ana, sam.id, true);
      const gone = await call(updatesHandler, "GET", { slug }, { [`session_${slug}`]: samToken });
      expect(gone.statusCode).toBe(401);
      expect(JSON.stringify(gone.body)).not.toContain(publicId);
      expect(JSON.stringify(gone.body)).not.toContain("res.cloudinary.com");
    } finally {
      process.env.CLOUDINARY_URL = fakeCloud;
    }
  });

  it("refuses a placeholder through the handler when placeholders are off", async () => {
    const { family, anaToken } = await familyMember();
    const slug = family.slug;
    const res = await call(updatesHandler, "POST", { slug }, { [`session_${slug}`]: anaToken }, {
      content: album(grey("Picnic")),
    });
    expect(res.statusCode).toBe(400);
    expect(await db.update.count()).toBe(0);
  });
});
