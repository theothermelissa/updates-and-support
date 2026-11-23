import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import groupHandler from "../../api/f/[slug]/groups/[id].js";
import groupsHandler from "../../api/f/[slug]/groups/index.js";
import { GROUP_GONE } from "../../server/audience.js";
import type { Db } from "../../server/db.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { addGroupMember, createGroup, deleteGroup, removeGroupMember, renameGroup } from "../../server/groups.js";
import { issueVideoUpload } from "../../server/notes.js";
import { listPeople, setRemoved, verifySupporter } from "../../server/people.js";
import { hashToken, newToken } from "../../server/tokens.js";
import { createUpdate, editUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import {
  answerCorrectly,
  fakeVideoStore,
  joinWithEmail,
  makeFamily,
  makeGroup,
  queuedOrDone,
  resetDb,
  verifiedSupporter,
} from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The Rivera family: Ana and Ben, family members; Gia, verified, and Uma, unverified, in
// Neighbors; Hal, verified, in Investors; Rae, verified, in Neighbors, removed; Ned, who only
// answered the question. Cousins has no one. Updates: E (everyone), N (Neighbors), NI
// (Neighbors and Investors), F (family members only), and V, a video shared with Neighbors.
// The Okafor family has its own Neighbors group with Olu.
async function setUp() {
  const { family, people } = await makeFamily(db, "Rivera", ["Ana", "Ben"]);
  const [ana, ben] = people as [Person, Person];
  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"]);
  const gia = await verifiedSupporter(db, family, "Gia");
  const hal = await verifiedSupporter(db, family, "Hal");
  const uma = (await joinWithEmail(db, family, "Uma")).person;
  const rae = await verifiedSupporter(db, family, "Rae");
  const ned = (await answerCorrectly(db, family)).person;
  const olu = await verifiedSupporter(db, okafor, "Olu");

  const neighbors = await makeGroup(db, family.id, "Neighbors", [gia.id, uma.id, rae.id]);
  const investors = await makeGroup(db, family.id, "Investors", [hal.id]);
  const cousins = await makeGroup(db, family.id, "Cousins");
  const okaforNeighbors = await makeGroup(db, okafor.id, "Neighbors", [olu.id]);
  await setRemoved(db, ana, rae.id, true);

  const e = await createUpdate(db, ana, { body: "Everyone news" });
  const n = await createUpdate(db, ana, { body: "Neighbors news", audience: { groups: [neighbors.id] } });
  const ni = await createUpdate(db, ana, { body: "Two groups' news", audience: { groups: [neighbors.id, investors.id] } });
  const f = await createUpdate(db, ana, { body: "Family only news", audience: { groups: [cousins.id] } });
  await db.updateGroup.deleteMany({ where: { updateId: f.id } });
  const videos = fakeVideoStore();
  const { publicId } = await issueVideoUpload(db, ana, videos.store);
  videos.videos.set(publicId, 10);
  const v = await createUpdate(db, ana, { video: publicId, audience: { groups: [neighbors.id] } }, undefined, undefined, videos.store);
  const o = await createUpdate(db, chidi!, { body: "Okafor news", audience: { groups: [okaforNeighbors.id] } });

  return {
    family,
    okafor,
    ana,
    ben,
    chidi: chidi!,
    gia,
    hal,
    uma,
    rae,
    ned,
    olu,
    neighbors,
    investors,
    cousins,
    okaforNeighbors,
    e: e.id,
    n: n.id,
    ni: ni.id,
    f: f.id,
    v: v.id,
    o: o.id,
  };
}

type Cast = Awaited<ReturnType<typeof setUp>>;

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

// Every group, membership, and audience in the database, to show that a refused call changed nothing.
async function snapshot() {
  return {
    groups: await db.group.findMany({ orderBy: { id: "asc" } }),
    members: await db.groupMember.findMany({ orderBy: [{ groupId: "asc" }, { personId: "asc" }] }),
    updateGroups: await db.updateGroup.findMany({ orderBy: [{ updateId: "asc" }, { groupId: "asc" }] }),
    audiences: await db.update.findMany({ orderBy: { id: "asc" }, select: { id: true, audience: true } }),
  };
}

// Each supporter's visible updates. Rae is read with her stale record, since she's removed.
async function supporterViews(s: Cast) {
  const views: Record<string, string[]> = {};
  for (const [name, person] of Object.entries({ gia: s.gia, hal: s.hal, uma: s.uma, rae: s.rae, ned: s.ned })) {
    views[name] = await seen(person);
  }
  return views;
}

function expectSubset(after: string[], before: string[]) {
  expect(after.filter((id) => !before.includes(id))).toEqual([]);
}

async function audienceOf(updateId: string, viewer: Person) {
  const feed = await listUpdates(db, viewer);
  return feed.find((u) => u.id === updateId)?.audience;
}

describe("who may manage groups", () => {
  it("refuses supporters, and treats another family's groups as missing", async () => {
    const s = await setUp();
    const before = await snapshot();
    const id = s.neighbors.id;

    // A supporter, even a member of the group, gets 403 on everything.
    const forbidden = { status: 403, message: "Only family members can do this" };
    expect(await refusal(createGroup(db, s.gia, { name: "Friends" }))).toEqual(forbidden);
    expect(await refusal(renameGroup(db, s.gia, id, "Friends"))).toEqual(forbidden);
    expect(await refusal(addGroupMember(db, s.gia, id, s.hal.id))).toEqual(forbidden);
    expect(await refusal(removeGroupMember(db, s.gia, id, s.gia.id))).toEqual(forbidden);
    expect(await refusal(deleteGroup(db, s.gia, id, []))).toEqual(forbidden);
    expect(await refusal(listPeople(db, s.gia))).toEqual(forbidden);

    // Another family's family member gets what a nonexistent id gets.
    const missing = await refusal(renameGroup(db, s.chidi, "no-such-group", "Friends"));
    expect(missing.status).toBe(404);
    expect(await refusal(renameGroup(db, s.chidi, id, "Friends"))).toEqual(missing);
    expect(await refusal(addGroupMember(db, s.chidi, id, s.olu.id))).toEqual(missing);
    expect(await refusal(addGroupMember(db, s.chidi, id, s.hal.id))).toEqual(missing);
    expect(await refusal(removeGroupMember(db, s.chidi, id, s.gia.id))).toEqual(missing);
    expect(await refusal(deleteGroup(db, s.chidi, id, []))).toEqual(missing);
    expect(await refusal(deleteGroup(db, s.chidi, id, [s.okaforNeighbors.id]))).toEqual(missing);
    expect(await snapshot()).toEqual(before);

    // Control: Rivera's own family member can do each of them.
    await renameGroup(db, s.ana, id, "Friends");
    await addGroupMember(db, s.ana, id, s.hal.id);
    await removeGroupMember(db, s.ana, id, s.gia.id);
    expect(await db.groupMember.findMany({ where: { groupId: id }, select: { personId: true } })).toEqual(
      expect.arrayContaining([{ personId: s.hal.id }]),
    );
    await deleteGroup(db, s.ana, id, []);
    expect(await db.group.findUnique({ where: { id } })).toBeNull();
  });
});

describe("who can be added to a group", () => {
  it("adds listed, active supporters only, including unverified ones", async () => {
    const s = await setUp();
    const investors = s.investors.id;
    const otherFamilySupporter = s.olu.id;
    const missing = await refusal(addGroupMember(db, s.ana, investors, "no-such-person"));
    expect(missing).toEqual({ status: 404, message: "Person not found" });

    // Uma is unverified: she can be added, and sees nothing of Investors until she's verified.
    await addGroupMember(db, s.ana, investors, s.uma.id);
    expect(await seen(s.uma)).toEqual([s.e]);
    await verifySupporter(db, s.ana, s.uma.id, true);
    expect(await seen(await db.person.findUniqueOrThrow({ where: { id: s.uma.id } }))).toEqual(sorted(s.e, s.n, s.ni, s.v));

    const before = await snapshot();
    expect(await refusal(addGroupMember(db, s.ana, investors, s.rae.id))).toEqual(missing); // removed
    expect(await refusal(addGroupMember(db, s.ana, investors, s.ned.id))).toEqual(missing); // no email
    expect(await refusal(addGroupMember(db, s.ana, investors, s.ben.id))).toEqual(missing); // family member
    expect(await refusal(addGroupMember(db, s.ana, investors, otherFamilySupporter))).toEqual(missing);
    expect(await refusal(addGroupMember(db, s.ana, investors, 42))).toMatchObject({ status: 400 });

    // Adding someone already in the group changes nothing.
    await addGroupMember(db, s.ana, investors, s.hal.id);
    expect(await snapshot()).toEqual(before);
  });
});

describe("taking access away", () => {
  it("hides a group's updates on the member's next request", async () => {
    const s = await setUp();
    expect(await seen(s.gia)).toEqual(sorted(s.e, s.n, s.ni, s.v));
    await removeGroupMember(db, s.ana, s.neighbors.id, s.gia.id);
    expect(await seen(s.gia)).toEqual([s.e]);
    // Removing someone who isn't in the group changes nothing.
    await removeGroupMember(db, s.ana, s.investors.id, s.gia.id);
    expect(await seen(s.hal)).toEqual(sorted(s.e, s.ni));
  });
});

describe("deleting a group", () => {
  it("makes updates shared only with it family-only by default, and never widens", async () => {
    const s = await setUp();
    const before = await supporterViews(s);
    await deleteGroup(db, s.ana, s.neighbors.id, []);
    const after = await supporterViews(s);
    for (const name of Object.keys(before)) expectSubset(after[name]!, before[name]!);

    // NI keeps Investors: Hal still sees it, Gia doesn't.
    expect(after.hal).toContain(s.ni);
    expect(after.gia).toEqual([s.e]);
    expect(await audienceOf(s.ni, s.ana)).toEqual({ groups: [{ id: s.investors.id, name: "Investors" }] });
    // N and the video are family members only.
    expect(await audienceOf(s.n, s.ana)).toEqual({ groups: [] });
    expect(await audienceOf(s.v, s.ana)).toEqual({ groups: [] });
    for (const views of Object.values(after)) {
      expect(views).not.toContain(s.n);
      expect(views).not.toContain(s.v);
    }
    // Absent moveTo is family members only too.
    await deleteGroup(db, s.ana, s.investors.id, undefined);
    expect(await audienceOf(s.ni, s.ana)).toEqual({ groups: [] });
    // Okafor's group of the same name is untouched.
    expect(await seen(s.olu)).toEqual([s.o]);
  });

  it("gives updates shared only with it the chosen groups, video updates included", async () => {
    const s = await setUp();
    await addGroupMember(db, s.ana, s.cousins.id, s.hal.id);
    const before = await supporterViews(s);
    await deleteGroup(db, s.ana, s.neighbors.id, [s.cousins.id]);
    const after = await supporterViews(s);

    // The family chose to widen N and V to Cousins: Hal gains exactly those.
    expect(after.hal).toEqual(sorted(...before.hal!, s.n, s.v));
    for (const name of ["gia", "uma", "rae", "ned"]) expectSubset(after[name]!, before[name]!);
    expect(after.gia).toEqual([s.e]);
    const chosen = { groups: [{ id: s.cousins.id, name: "Cousins" }] };
    expect(await audienceOf(s.n, s.ana)).toEqual(chosen);
    expect(await audienceOf(s.v, s.ana)).toEqual(chosen);
    // NI wasn't shared only with Neighbors, so it just loses it, gaining nothing.
    expect(await audienceOf(s.ni, s.ana)).toEqual({ groups: [{ id: s.investors.id, name: "Investors" }] });

    // Several chosen groups: N and V, now shared only with Cousins, get each of them.
    const friends = await createGroup(db, s.ana, { name: "Friends" });
    await deleteGroup(db, s.ana, s.cousins.id, [s.investors.id, friends.id]);
    const both = { groups: [friends, { id: s.investors.id, name: "Investors" }] };
    expect(await audienceOf(s.n, s.ana)).toEqual(both);
    expect(await audienceOf(s.v, s.ana)).toEqual(both);
    expect(await audienceOf(s.ni, s.ana)).toEqual({ groups: [{ id: s.investors.id, name: "Investors" }] });
    // F, already family members only, stays so.
    expect(await audienceOf(s.f, s.ana)).toEqual({ groups: [] });
  });

  it("refuses a bad choice of groups and changes nothing", async () => {
    const s = await setUp();
    const before = await snapshot();
    const id = s.neighbors.id;
    expect(await refusal(deleteGroup(db, s.ana, id, [id]))).toMatchObject({ status: 400 });
    expect(await refusal(deleteGroup(db, s.ana, id, [s.investors.id, id]))).toMatchObject({ status: 400 });
    const gone = { status: 409, message: GROUP_GONE };
    expect(await refusal(deleteGroup(db, s.ana, id, [s.okaforNeighbors.id]))).toEqual(gone);
    expect(await refusal(deleteGroup(db, s.ana, id, [s.investors.id, s.okaforNeighbors.id]))).toEqual(gone);
    expect(await refusal(deleteGroup(db, s.ana, id, ["no-such-group"]))).toEqual(gone);
    expect(await refusal(deleteGroup(db, s.ana, id, [s.investors.id, s.investors.id]))).toMatchObject({ status: 400 });
    expect(await refusal(deleteGroup(db, s.ana, id, s.investors.id))).toMatchObject({ status: 400 });
    expect(await refusal(deleteGroup(db, s.ana, id, [7]))).toMatchObject({ status: 400 });
    expect(await snapshot()).toEqual(before);
  });
});

describe("an edit and a group deletion at the same moment", () => {
  it("never shares the update with a group nobody chose for it", async () => {
    const s = await setUp();

    // Pauses the edit just after it replaces N's groups, before it commits.
    let reached!: () => void;
    let release!: () => void;
    const atPause = new Promise<void>((resolve) => (reached = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const paused = db.$extends({
      query: {
        updateGroup: {
          async createMany({ args, query }) {
            const created = await query(args);
            reached();
            await released;
            return created;
          },
        },
      },
    }) as unknown as Db;

    const editing = editUpdate(paused, s.ana, s.n, { body: "Now for the investors", audience: { groups: [s.investors.id] } });
    await Promise.race([atPause, editing]);
    const deleting = deleteGroup(db, s.ana, s.neighbors.id, [s.cousins.id]);
    await queuedOrDone(db, deleting, ["advisory", "transactionid"]);
    release();
    const results = await Promise.allSettled([editing, deleting]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);

    expect(await audienceOf(s.n, s.ana)).toEqual({ groups: [{ id: s.investors.id, name: "Investors" }] });
  });
});

describe("the People page's groups", () => {
  it("lists each group's members and how many updates are shared only with it", async () => {
    const s = await setUp();
    const { groups } = await listPeople(db, s.ana);
    expect(groups).toEqual([
      { id: s.cousins.id, name: "Cousins", members: [], onlyHere: 0 },
      {
        id: s.investors.id,
        name: "Investors",
        members: [{ id: s.hal.id, name: "Hal", email: "hal@example.com", emailVerified: true, removed: false }],
        onlyHere: 0,
      },
      {
        id: s.neighbors.id,
        name: "Neighbors",
        members: [
          { id: s.gia.id, name: "Gia", email: "gia@example.com", emailVerified: true, removed: false },
          { id: s.rae.id, name: "Rae", email: "rae@example.com", emailVerified: true, removed: true },
          { id: s.uma.id, name: "Uma", email: "uma@example.com", emailVerified: false, removed: false },
        ],
        // N and V; not NI, shared with Investors too, nor F.
        onlyHere: 2,
      },
    ]);
  });
});

describe("posting with a deleted group", () => {
  it("is refused, and nothing is stored", async () => {
    const s = await setUp();
    await deleteGroup(db, s.ana, s.investors.id, []);
    const count = await db.update.count();
    expect(
      await refusal(createUpdate(db, s.ana, { body: "For the investors", audience: { groups: [s.investors.id] } })),
    ).toEqual({ status: 409, message: GROUP_GONE });
    expect(await db.update.count()).toBe(count);
  });
});

describe("group names", () => {
  it("trims names, keeps them 1 to 50 characters, and refuses duplicates ignoring capitals", async () => {
    const s = await setUp();
    expect(await createGroup(db, s.ana, { name: "  Book club  " })).toMatchObject({ name: "Book club" });
    for (const name of ["", "   ", "x".repeat(51), 7, undefined]) {
      expect(await refusal(createGroup(db, s.ana, { name }))).toMatchObject({ status: 400 });
    }
    expect(await createGroup(db, s.ana, { name: "y".repeat(50) })).toMatchObject({ name: "y".repeat(50) });
    expect(await refusal(createGroup(db, s.ana, { name: "neighbors" }))).toMatchObject({ status: 409 });
    expect(await refusal(renameGroup(db, s.ana, s.investors.id, " NEIGHBORS "))).toMatchObject({ status: 409 });
    expect(await refusal(renameGroup(db, s.ana, s.investors.id, ""))).toMatchObject({ status: 400 });
    // A group may change its own capitals, and another family's names don't count.
    expect(await renameGroup(db, s.ana, s.investors.id, "INVESTORS")).toEqual({ id: s.investors.id, name: "INVESTORS" });
    await createGroup(db, s.chidi, { name: "Investors" });
    expect(await db.group.count({ where: { familyId: s.family.id } })).toBe(5);
  });

  it("allows at most 50 groups in a family", async () => {
    const s = await setUp();
    for (let i = 4; i <= 50; i++) await createGroup(db, s.ana, { name: `Group ${i}` });
    expect(await db.group.count({ where: { familyId: s.family.id } })).toBe(50);
    expect(await refusal(createGroup(db, s.ana, { name: "One too many" }))).toMatchObject({ status: 409 });
    expect(await db.group.count({ where: { familyId: s.family.id } })).toBe(50);
    // Renaming at the cap is fine.
    await renameGroup(db, s.ana, s.cousins.id, "Cousins and aunts");
  });
});

describe("the groups endpoints", () => {
  const savedUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  });
  afterAll(() => {
    process.env.DATABASE_URL = savedUrl;
  });

  async function sessionFor(personId: string) {
    const token = newToken();
    await db.session.create({
      data: { personId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    return token;
  }

  async function call(
    handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>,
    method: string,
    slug: string,
    token: string,
    body: unknown,
    id?: string,
  ) {
    const req = {
      method,
      query: id ? { slug, id } : { slug },
      headers: { "content-type": "application/json" },
      body,
      cookies: { [`session_${slug}`]: token },
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
    return { status: res.statusCode, body: res.body as Record<string, unknown> };
  }

  it("create, rename, add, remove, and delete for family members only", async () => {
    const s = await setUp();
    const slug = s.family.slug;
    const ana = await sessionFor(s.ana.id);
    const gia = await sessionFor(s.gia.id);

    expect(await call(groupsHandler, "POST", slug, gia, { name: "Friends" })).toMatchObject({ status: 403 });
    const created = await call(groupsHandler, "POST", slug, ana, { name: "Friends" });
    expect(created).toMatchObject({ status: 200, body: { group: { name: "Friends" } } });
    const id = (created.body.group as { id: string }).id;

    expect(await call(groupHandler, "PATCH", slug, gia, { add: s.hal.id }, id)).toMatchObject({ status: 403 });
    expect(await call(groupHandler, "PATCH", slug, ana, { name: "Old friends" }, id)).toMatchObject({ status: 200 });
    expect(await call(groupHandler, "PATCH", slug, ana, { add: s.hal.id }, id)).toMatchObject({ status: 200 });
    expect(await call(groupHandler, "PATCH", slug, ana, { add: s.gia.id }, id)).toMatchObject({ status: 200 });
    expect(await call(groupHandler, "PATCH", slug, ana, { remove: s.gia.id }, id)).toMatchObject({ status: 200 });
    expect(await call(groupHandler, "PATCH", slug, ana, { add: s.gia.id, remove: s.hal.id }, id)).toMatchObject({ status: 400 });
    expect(await call(groupHandler, "PATCH", slug, ana, {}, id)).toMatchObject({ status: 400 });
    expect(await db.group.findUniqueOrThrow({ where: { id }, include: { members: true } })).toMatchObject({
      name: "Old friends",
      members: [{ personId: s.hal.id }],
    });

    expect(await call(groupHandler, "DELETE", slug, gia, { moveTo: [] }, id)).toMatchObject({ status: 403 });
    expect(await call(groupHandler, "DELETE", slug, ana, { moveTo: [] }, id)).toMatchObject({ status: 200 });
    expect(await db.group.findUnique({ where: { id } })).toBeNull();
  });
});
