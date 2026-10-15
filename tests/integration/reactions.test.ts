import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import handler from "../../api/f/[slug]/reactions.js";
import { getDb } from "../../server/db.js";
import { addEmail } from "../../server/gate.js";
import type { Family, Person } from "../../server/generated/prisma/client.js";
import { setRemoved } from "../../server/people.js";
import { setReaction } from "../../server/reactions.js";
import { createUpdate, deleteUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { answerCorrectly, fakeMailer, joinWithEmail, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The Rivera family (Ana) with supporter Sam and an update, and the Okafor family (Chidi)
// with supporter Olu and an update of their own.
async function setUp() {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const sam = await joinWithEmail(db, family, "Sam");
  const olu = await joinWithEmail(db, okafor, "Olu");
  const update = await createUpdate(db, ana!, "Rivera news");
  const okaforUpdate = await createUpdate(db, chidi!, "Okafor news");
  return { family, okafor, ana: ana!, chidi: chidi!, sam: sam.person, samToken: sam.sessionToken, olu, update, okaforUpdate };
}

function react(person: Person, updateId: string, kind: unknown = "heart", on: unknown = true) {
  return setReaction(db, person, { updateId, kind, on });
}

async function feedFor(person: Person) {
  return (await listUpdates(db, person)).find((u) => u.body === "Rivera news")!;
}

describe("who may react, and to what", () => {
  it("treats another family's update as not found", async () => {
    const { olu, update } = await setUp();
    await expect(react(olu.person, update.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.reaction.count()).toBe(0);
  });

  it("refuses a removed supporter, whose earlier reactions are hidden until restored", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id, "pray");
    await setRemoved(db, ana, sam.id, true);

    // Sam's request was authorized before his removal and arrives after it.
    await expect(react(sam, update.id, "hug")).rejects.toMatchObject({ status: 403 });
    expect(await db.reaction.count({ where: { personId: sam.id, kind: "hug" } })).toBe(0);
    expect(await feedFor(ana)).toMatchObject({ reactions: [], reactors: { count: 0, names: [] } });

    await setRemoved(db, ana, sam.id, false);
    expect(await feedFor(ana)).toMatchObject({
      reactions: [{ kind: "pray", count: 1, names: ["Sam"] }],
      reactors: { count: 1, names: ["Sam"] },
    });
  });

  it("rejects an unknown reaction or a non-boolean on, storing nothing", async () => {
    const { sam, update } = await setUp();
    for (const kind of ["thumbsup", "", 42]) {
      await expect(react(sam, update.id, kind)).rejects.toMatchObject({ status: 400 });
    }
    await expect(react(sam, update.id, "heart", "yes")).rejects.toMatchObject({ status: 400 });
    await expect(setReaction(db, sam, { kind: "heart", on: true })).rejects.toMatchObject({ status: 400 });
    expect(await db.reaction.count()).toBe(0);
  });
});

describe("what each reader sees", () => {
  it("shows a family's reactions only with its own updates", async () => {
    const { ana, sam, olu, update } = await setUp();
    await react(sam, update.id);
    await react(ana, update.id, "party");

    const okaforFeed = JSON.stringify(await listUpdates(db, olu.person));
    expect(okaforFeed).not.toContain("Sam");
    expect(okaforFeed).not.toContain("Ana");
  });

  it("filters reactions by family when reading, not only when writing", async () => {
    const { ana, olu, update } = await setUp();
    await db.reaction.create({ data: { updateId: update.id, personId: olu.person.id, kind: "heart" } });
    expect(await feedFor(ana)).toMatchObject({ reactions: [], reactors: { count: 0 } });
  });

  it("sends names, never IDs or emails", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id);
    const feed = JSON.stringify(await listUpdates(db, ana));
    expect(feed).toContain("Sam");
    expect(feed).not.toContain(sam.id);
    expect(feed).not.toContain(sam.email!);
  });

  it("shows the viewer as theirs, not by name, and everyone else by name", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id);
    await react(ana, update.id);

    expect(await feedFor(sam)).toMatchObject({
      reactions: [{ kind: "heart", count: 2, names: ["Ana Rivera"], mine: true }],
      reactors: { count: 2, names: ["Ana Rivera"], you: true },
    });
    expect(await feedFor(ana)).toMatchObject({
      reactions: [{ kind: "heart", count: 2, names: ["Sam"], mine: true }],
      reactors: { count: 2, names: ["Sam"], you: true },
    });
  });

  it("counts a nameless reader without naming them, and names them once they give a name", async () => {
    const { family, ana, update } = await setUp();
    const reader = await answerCorrectly(db, family as Family);
    await react(reader.person, update.id, "hug");
    expect(await feedFor(ana)).toMatchObject({
      reactions: [{ kind: "hug", count: 1, names: [] }],
      reactors: { count: 1, names: [] },
    });

    await addEmail(db, fakeMailer().send, family, reader.person, { name: "Tess Neighbor", email: "tess@example.com" });
    expect(await feedFor(ana)).toMatchObject({ reactors: { count: 1, names: ["Tess Neighbor"] } });
  });
});

describe("setting reactions", () => {
  it("is idempotent, one of each per person, and counts a person once across reactions", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id);
    await react(sam, update.id);
    expect(await db.reaction.count()).toBe(1);

    await react(sam, update.id, "pray");
    await react(sam, update.id, "laugh");
    expect(await feedFor(ana)).toMatchObject({
      reactions: [
        { kind: "heart", count: 1, mine: false },
        { kind: "pray", count: 1 },
        { kind: "laugh", count: 1 },
      ],
      reactors: { count: 1, names: ["Sam"], you: false },
    });

    await react(sam, update.id, "heart", false);
    await react(sam, update.id, "heart", false);
    expect(await db.reaction.count({ where: { kind: "heart" } })).toBe(0);
  });

  it("goes with its update when the update is deleted", async () => {
    const { ana, sam, update } = await setUp();
    await react(sam, update.id);
    await deleteUpdate(db, ana, update.id);
    expect(await db.reaction.count()).toBe(0);
  });
});

describe("the reactions endpoint", () => {
  const savedUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    // The handler uses getDb, which reads DATABASE_URL on first use.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  });
  afterAll(async () => {
    await getDb().$disconnect();
    process.env.DATABASE_URL = savedUrl;
  });

  async function post(slug: string, cookies: Record<string, string>, body: unknown) {
    const req = { method: "POST", query: { slug }, headers: { "content-type": "application/json" }, cookies, body };
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
    await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    return res.statusCode;
  }

  it("refuses a request without this family's session, storing nothing", async () => {
    const { family, olu, samToken, update } = await setUp();
    const body = { updateId: update.id, kind: "heart", on: true };

    expect(await post(family.slug, {}, body)).toBe(401);
    // Under this family's cookie name, so the handler reads it and the family check refuses it.
    expect(await post(family.slug, { [`session_${family.slug}`]: olu.sessionToken }, body)).toBe(401);
    expect(await db.reaction.count()).toBe(0);

    expect(await post(family.slug, { [`session_${family.slug}`]: samToken }, body)).toBe(200);
    expect(await db.reaction.count()).toBe(1);
  });
});
