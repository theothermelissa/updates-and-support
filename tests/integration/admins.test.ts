import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getSession } from "../../server/auth.js";
import { createFamily } from "../../server/families.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { personView } from "../../server/http.js";
import { approveInviteRequest, declineInviteRequest, notifyInviteRequest } from "../../server/inviteRequests.js";
import { createHelp, deleteHelp, offerHelp, removeOffer, resolveHelp, setHelpMessage, updateHelp } from "../../server/help.js";
import { createNote, deleteNote, setAllowNotesByDefault } from "../../server/notes.js";
import { issuePhotoUpload } from "../../server/photos.js";
import {
  addFamilyMember,
  addSupporter,
  changeQuestion,
  listPeople,
  setAdmin,
  setPrivacyNotice,
  setRemoved,
  verifySupporter,
} from "../../server/people.js";
import { setNoteReactions } from "../../server/reactions.js";
import { createUpdate, deleteUpdate, editUpdate, listUpdates, newUpdateDefaults } from "../../server/updates.js";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  removeGroupMember,
  renameGroup,
} from "../../server/groups.js";
import { hashToken, newToken } from "../../server/tokens.js";
import { createTestDb } from "./db.js";
import {
  fakeMailer,
  joinWithEmail,
  listAdminPeople,
  makeFamily,
  makeGroup,
  makeNonAdmin,
  resetDb,
} from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const NOT_ADMIN = { status: 403, message: "Only admins can do this" };

async function refusal(work: Promise<unknown>) {
  try {
    await work;
  } catch (err) {
    const { status, message } = err as { status?: number; message?: string };
    return { status, message };
  }
  return null;
}

function reload(person: Person) {
  return db.person.findUniqueOrThrow({ where: { id: person.id } });
}

// The Rivera family: admins Ana and Luis, non-admin Ben, supporter Sam (with a phone), a group,
// and a removed supporter. The Okafor family is invite-only, with admin Chidi, non-admin Dara,
// and a pending request to join.
async function setUp() {
  const { family, people } = await makeFamily(db, "Rivera", ["Ana", "Luis"]);
  const ana = people.find((p) => p.name === "Ana Rivera")!;
  const luis = people.find((p) => p.name === "Luis Rivera")!;
  const ben = await makeNonAdmin(db, family, "Ben");
  const samJoined = await joinWithEmail(db, family, "Sam");
  const sam = await db.person.update({ where: { id: samJoined.person.id }, data: { phone: "555-0100" } });
  const tess = (await joinWithEmail(db, family, "Tess")).person;
  await setRemoved(db, ana, tess.id, true);
  const neighbors = await makeGroup(db, family.id, "Neighbors", [sam.id]);

  const { family: okafor, people: [chidi] } = await makeFamily(db, "Okafor", ["Chidi"], { inviteOnly: true });
  const dara = await makeNonAdmin(db, okafor, "Dara");
  const request = await db.inviteRequest.create({
    data: { familyId: okafor.id, name: "Pat Visitor", email: "pat@example.com", network: "198.51.100.9" },
  });
  return {
    family,
    okafor,
    ana,
    luis,
    ben,
    sam,
    samToken: samJoined.sessionToken,
    tess,
    neighbors,
    chidi: chidi!,
    dara,
    request,
  };
}
type Setup = Awaited<ReturnType<typeof setUp>>;

// Everything an admin could change about the people in the two families, to show a refused
// call changed nothing.
async function snapshot() {
  return JSON.stringify({
    people: await db.person.findMany({ orderBy: { id: "asc" } }),
    families: await db.family.findMany({ orderBy: { id: "asc" } }),
    groups: await db.group.findMany({ orderBy: { id: "asc" }, include: { members: true } }),
    requests: await db.inviteRequest.findMany({ orderBy: { id: "asc" } }),
    sessions: await db.session.count(),
  });
}

describe("a non-admin is refused everywhere that's gated", () => {
  type Row = { name: string; run: (s: Setup) => Promise<unknown> };
  const rows: Row[] = [
    {
      name: "addFamilyMember",
      run: (s) => addFamilyMember(db, fakeMailer().send, s.ben, { name: "Eve Rivera", email: "eve@example.com", admin: true }),
    },
    { name: "addSupporter", run: (s) => addSupporter(db, fakeMailer().send, s.ben, { name: "Gia", email: "gia@example.com" }) },
    { name: "setRemoved (a supporter)", run: (s) => setRemoved(db, s.ben, s.sam.id, true) },
    { name: "setRemoved (restoring a supporter)", run: (s) => setRemoved(db, s.ben, s.tess.id, false) },
    { name: "setRemoved (a family member)", run: (s) => setRemoved(db, s.ben, s.luis.id, true) },
    { name: "verifySupporter", run: (s) => verifySupporter(db, s.ben, s.sam.id, true) },
    { name: "setPrivacyNotice", run: (s) => setPrivacyNotice(db, s.ben, { privacyNotice: "Private please" }) },
    { name: "changeQuestion", run: (s) => changeQuestion(db, s.ben, { question: "Where?", answers: ["Lisbon"] }) },
    { name: "setAdmin", run: (s) => setAdmin(db, s.ben, s.luis.id, false) },
    { name: "createGroup", run: (s) => createGroup(db, s.ben, { name: "Church" }) },
    { name: "renameGroup", run: (s) => renameGroup(db, s.ben, s.neighbors.id, "Street") },
    { name: "addGroupMember", run: (s) => addGroupMember(db, s.ben, s.neighbors.id, s.sam.id) },
    { name: "removeGroupMember", run: (s) => removeGroupMember(db, s.ben, s.neighbors.id, s.sam.id) },
    { name: "deleteGroup", run: (s) => deleteGroup(db, s.ben, s.neighbors.id, []) },
    { name: "setAllowNotesByDefault", run: (s) => setAllowNotesByDefault(db, s.ben, { allowNotesByDefault: false }) },
    { name: "setNoteReactions", run: (s) => setNoteReactions(db, s.ben, { reactions: ["pray"] }) },
    { name: "approveInviteRequest", run: (s) => approveInviteRequest(db, fakeMailer().send, s.dara, s.request.id) },
    { name: "declineInviteRequest", run: (s) => declineInviteRequest(db, s.dara, s.request.id) },
  ];

  it.each(rows)("$name", async ({ run }) => {
    const s = await setUp();
    const before = await snapshot();
    expect(await refusal(run(s))).toEqual(NOT_ADMIN);
    expect(await snapshot()).toBe(before);
  });

  // The in-transaction check refuses a real non-admin too, so these three rows would pass with
  // their first line removed. This person is an admin in the database, but their object says
  // otherwise: only the first line reads the object.
  const objectRows: Row[] = [
    {
      name: "addFamilyMember",
      run: (s) =>
        addFamilyMember(db, fakeMailer().send, { ...s.ana, isAdmin: false }, { name: "Eve Rivera", email: "eve@example.com", admin: true }),
    },
    { name: "setRemoved (a family member)", run: (s) => setRemoved(db, { ...s.ana, isAdmin: false }, s.luis.id, true) },
    { name: "setAdmin", run: (s) => setAdmin(db, { ...s.ana, isAdmin: false }, s.luis.id, false) },
  ];

  it.each(objectRows)("judges the person it's given: $name", async ({ run }) => {
    const s = await setUp();
    const before = await snapshot();
    expect(await refusal(run(s))).toEqual(NOT_ADMIN);
    expect(await snapshot()).toBe(before);
  });

  it("refuses a supporter the same way", async () => {
    const s = await setUp();
    expect(await refusal(createGroup(db, s.sam, { name: "Church" }))).toEqual(NOT_ADMIN);
    expect(await refusal(setAdmin(db, s.sam, s.luis.id, false))).toEqual(NOT_ADMIN);
  });
});

describe("a non-admin does everything else a family member does", () => {
  it("posts, edits and deletes updates, including family-only ones and photo tickets", async () => {
    const s = await setUp();
    const mail = fakeMailer();
    const posted = await createUpdate(db, s.dara, { body: "Good news" , audience: "family" }, mail.sendMany);
    expect(posted.id).toBeTruthy();
    const edited = await editUpdate(db, s.dara, posted.id, { body: "Better news", audience: "family" });
    expect(edited.body).toContain("Better");
    // Any family member can edit and delete any update in the family.
    const anas = await createUpdate(db, s.chidi, { body: "Ana's note", audience: "family" });
    await editUpdate(db, s.dara, anas.id, { body: "Edited by Dara", audience: "family" });
    await deleteUpdate(db, s.dara, anas.id);
    await deleteUpdate(db, s.dara, posted.id);
    expect(await db.update.count({ where: { familyId: s.okafor.id } })).toBe(0);

    const ticket = issuePhotoUpload(s.dara, {
      placeholders: false,
      cloudinary: { cloudName: "demo", apiKey: "key", apiSecret: "secret" },
    });
    expect(ticket.publicId).toBeTruthy();
  });

  it("leaves and deletes notes, and runs How to help", async () => {
    const s = await setUp();
    const update = await createUpdate(db, s.ben, { body: "News" });
    const { note } = await createNote(db, s.ben, { updateId: update.id, body: "Thinking of you", color: "sky", audience: "everyone" });
    const theirs = await createNote(db, s.sam, { updateId: update.id, body: "Hello", color: "sky" });
    await deleteNote(db, s.ben, note.id);
    // A family member deletes anyone's note.
    await deleteNote(db, s.ben, theirs.note.id);
    expect(await db.note.count()).toBe(0);

    const input = { requireName: true, requireEmail: false, requirePhone: false, date: null, time: null };
    const request = await createHelp(db, s.ben, { ...input, body: "A ride", slots: 2 });
    await updateHelp(db, s.ben, request.id, { ...input, body: "Two rides", slots: 2 });
    expect((await resolveHelp(db, s.ben, request.id, { resolved: true })).resolvedAt).not.toBeNull();
    expect((await resolveHelp(db, s.ben, request.id, { resolved: false })).resolvedAt).toBeNull();
    await setHelpMessage(db, s.ben, { message: "Thank you all" });
    await offerHelp(db, undefined, s.sam, request.id, { helping: true });
    const offer = await db.helpOffer.findFirstOrThrow({ where: { requestId: request.id } });
    await removeOffer(db, s.ben, request.id, offer.id);
    expect(await db.helpOffer.count()).toBe(0);
    await deleteHelp(db, s.ben, request.id);
    expect(await db.helpRequest.count()).toBe(0);
  });

  it("gets the post form's groups, sees every update, and is still a family member", async () => {
    const s = await setUp();
    const forNeighbors = await createUpdate(db, s.ana, { body: "For the neighbors", audience: { groups: [s.neighbors.id] } });
    const everyone = await createUpdate(db, s.ana, { body: "Everyone" });

    expect(await newUpdateDefaults(db, s.ben)).toEqual({
      allowNotesByDefault: true,
      groups: [{ id: s.neighbors.id, name: "Neighbors" }],
    });
    const feed = await listUpdates(db, s.ben);
    expect(feed.map((u) => u.id).sort()).toEqual([forNeighbors.id, everyone.id].sort());

    const token = newToken();
    await db.session.create({
      data: { personId: s.ben.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });
    expect(await getSession(db, s.family.slug, token)).toMatchObject({ id: s.ben.id, role: "family", isAdmin: false });
  });
});

describe("the People page", () => {
  it("is read-only for a non-admin, with nothing else in the response", async () => {
    const s = await setUp();
    await setPrivacyNotice(db, s.ana, { privacyNotice: "Please keep Sam's news private." });
    await setNoteReactions(db, s.ana, { reactions: ["pray"] });
    await db.session.create({
      data: { personId: s.sam.id, tokenHash: hashToken(newToken()), expiresAt: new Date(Date.now() + 60_000) },
    });
    const people = await listPeople(db, s.ben);

    expect(Object.keys(people).sort()).toEqual(["admin", "familyMembers", "supporters"]);
    expect(people.admin).toBe(false);
    expect([...people.familyMembers].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: s.ana.id, name: "Ana Rivera", email: s.ana.email, isYou: false },
        { id: s.luis.id, name: "Luis Rivera", email: s.luis.email, isYou: false },
        { id: s.ben.id, name: "Ben", email: s.ben.email, isYou: true },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(people.supporters).toMatchObject([{ id: s.sam.id, name: "Sam", email: s.sam.email, phone: "555-0100" }]);
    // Not the removed supporter, the group, the question, the answers, or the banner.
    const text = JSON.stringify(people);
    for (const hidden of ["Tess", "Neighbors", "dog's name", "Biscuit", "keep Sam's news private", "pray"]) {
      expect(text).not.toContain(hidden);
    }
    expect(await refusal(listPeople(db, s.sam))).toEqual({ status: 403, message: "Only family members can do this" });
  });

  it("gives an admin everything, and each family member's admin status", async () => {
    const s = await setUp();
    const people = await listAdminPeople(db, s.ana);
    expect(people.familyMembers.map((m) => [m.name, m.isAdmin]).sort()).toEqual([
      ["Ana Rivera", true],
      ["Ben", false],
      ["Luis Rivera", true],
    ]);
    expect(people.groups).toHaveLength(1);
    expect(people.removed.map((r) => r.name)).toEqual(["Tess"]);
    expect(people.question).toBe("What is the dog's name?");
    const okafor = await listAdminPeople(db, s.chidi);
    expect(okafor.inviteRequests).toHaveLength(1);
  });
});

// Waits until `count` transactions are queued on a row lock, or the given work has finished.
async function queued(count: number, ...work: Promise<unknown>[]) {
  let done = false;
  for (const w of work) w.then(() => (done = true), () => (done = true));
  for (let i = 0; i < 400 && !done; i++) {
    const [row] = await db.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype IN ('transactionid', 'tuple') AND NOT granted`;
    if (row!.waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Runs two pieces of work while the test holds the family's lock, so both queue behind it and
// then take turns. Neither may finish before the lock is released: that is what shows each one
// takes the lock, whatever the timing.
async function bothQueueOnTheFamilyLock(familyId: string, first: () => Promise<unknown>, second: () => Promise<unknown>) {
  let work: Promise<unknown>[] = [];
  let finishedEarly = false;
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Family" WHERE id = ${familyId} FOR UPDATE`;
      work = [first(), second()];
      let early = false;
      for (const w of work) w.then(() => (early = true), () => (early = true));
      await queued(2, ...work);
      await new Promise((resolve) => setTimeout(resolve, 20));
      finishedEarly = early;
    },
    { timeout: 10_000 },
  );
  return { results: await Promise.allSettled(work), finishedEarly };
}

describe("a family keeps at least one admin", () => {
  it("refuses to demote the only admin, who stays an admin", async () => {
    const { family, people: [ana] } = await makeFamily(db, "Rivera");
    const ben = await makeNonAdmin(db, family, "Ben");
    expect(await refusal(setAdmin(db, ana!, ana!.id, false))).toEqual({
      status: 409,
      message: "A family needs at least one admin.",
    });
    expect((await reload(ana!)).isAdmin).toBe(true);
    // Promoting Ben first makes it fine; a family member can be both ways.
    await setAdmin(db, ana!, ben.id, true);
    await setAdmin(db, ana!, ana!.id, false);
    expect((await reload(ana!)).isAdmin).toBe(false);
    expect((await reload(ben)).isAdmin).toBe(true);
  });

  it("lets two admins demote each other at the same moment only one way", async () => {
    const s = await setUp();
    const { results, finishedEarly } = await bothQueueOnTheFamilyLock(
      s.family.id,
      () => setAdmin(db, s.ana, s.luis.id, false),
      () => setAdmin(db, s.luis, s.ana.id, false),
    );
    expect(finishedEarly).toBe(false);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const admins = await db.person.count({ where: { familyId: s.family.id, role: "family", isAdmin: true } });
    // Ana and Luis were the family's admins; Ben is not one.
    expect(admins).toBe(1);
  });

  it("lets two admins demote themselves at the same moment only one way", async () => {
    const s = await setUp();
    const { results, finishedEarly } = await bothQueueOnTheFamilyLock(
      s.family.id,
      () => setAdmin(db, s.ana, s.ana.id, false),
      () => setAdmin(db, s.luis, s.luis.id, false),
    );
    expect(finishedEarly).toBe(false);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await db.person.count({ where: { familyId: s.family.id, role: "family", isAdmin: true } })).toBe(1);
  });

  it("lets one admin remove another while that one demotes the first, only one way", async () => {
    const s = await setUp();
    const { results, finishedEarly } = await bothQueueOnTheFamilyLock(
      s.family.id,
      () => setRemoved(db, s.ana, s.luis.id, true),
      () => setAdmin(db, s.luis, s.ana.id, false),
    );
    expect(finishedEarly).toBe(false);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const active = await db.person.count({
      where: { familyId: s.family.id, role: "family", isAdmin: true, removedAt: null },
    });
    expect(active).toBe(1);
  });
});

describe("a demotion applies at once", () => {
  it("keeps the session but not the power", async () => {
    const s = await setUp();
    const token = newToken();
    await db.session.create({
      data: { personId: s.luis.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });
    expect((await getSession(db, s.family.slug, token))?.isAdmin).toBe(true);
    await setAdmin(db, s.ana, s.luis.id, false);

    const luis = await getSession(db, s.family.slug, token);
    expect(luis).toMatchObject({ id: s.luis.id, role: "family", isAdmin: false });
    expect(personView(luis!)).toMatchObject({ isAdmin: false });
    expect(await refusal(setPrivacyNotice(db, luis!, { privacyNotice: "x" }))).toEqual(NOT_ADMIN);
  });

  it("refuses a just-demoted admin's stale request to add or remove a family member", async () => {
    const s = await setUp();
    // Luis's object, loaded while he was an admin, used after Ana demoted him.
    const stale = s.luis;
    await setAdmin(db, s.ana, s.luis.id, false);

    expect(await refusal(addFamilyMember(db, fakeMailer().send, stale, { name: "Eve", email: "eve@example.com", admin: true }))).toEqual(NOT_ADMIN);
    expect(await db.person.count({ where: { email: "eve@example.com" } })).toBe(0);

    expect(await refusal(setRemoved(db, stale, s.ben.id, true))).toEqual(NOT_ADMIN);
    expect((await reload(s.ben)).removedAt).toBeNull();

    expect(await refusal(setAdmin(db, stale, s.ben.id, true))).toEqual(NOT_ADMIN);
    expect((await reload(s.ben)).isAdmin).toBe(false);
  });
});

describe("addFamilyMember and admin", () => {
  it("requires a true or false, and creates nothing without one", async () => {
    const s = await setUp();
    for (const admin of [undefined, null, "true", 1, "yes"]) {
      const result = await refusal(
        addFamilyMember(db, fakeMailer().send, s.ana, { name: "Eve", email: "eve@example.com", admin }),
      );
      expect(result).toEqual({ status: 400, message: "Choose whether they can manage people and settings." });
    }
    expect(await db.person.count({ where: { email: "eve@example.com" } })).toBe(0);
  });

  it("stores the choice for a new, a promoted, and a restored family member", async () => {
    const s = await setUp();
    const add = (name: string, email: string, admin: boolean) =>
      addFamilyMember(db, fakeMailer().send, s.ana, { name, email, admin });
    const admin = async (email: string) =>
      (await db.person.findUniqueOrThrow({ where: { familyId_email: { familyId: s.family.id, email } } })).isAdmin;

    expect((await add("Eve", "eve@example.com", true)).outcome).toBe("added");
    expect(await admin("eve@example.com")).toBe(true);
    expect((await add("Fay", "fay@example.com", false)).outcome).toBe("added");
    expect(await admin("fay@example.com")).toBe(false);

    // A supporter promoted, both ways.
    expect((await add("Sam", s.sam.email!, true)).outcome).toBe("promoted");
    expect(await admin(s.sam.email!)).toBe(true);
    const hal = (await joinWithEmail(db, s.family, "Hal")).person;
    expect((await add("Hal", hal.email!, false)).outcome).toBe("promoted");
    expect(await admin(hal.email!)).toBe(false);

    // A removed admin restored as a non-admin, and a removed non-admin restored as an admin.
    await setRemoved(db, s.ana, s.luis.id, true);
    expect((await reload(s.luis)).isAdmin).toBe(true);
    expect((await add("Luis", s.luis.email!, false)).outcome).toBe("restored");
    expect(await reload(s.luis)).toMatchObject({ isAdmin: false, removedAt: null });
    await setRemoved(db, s.ana, s.ben.id, true);
    expect((await add("Ben", s.ben.email!, true)).outcome).toBe("restored");
    expect(await reload(s.ben)).toMatchObject({ isAdmin: true, removedAt: null });
  });

  it("never changes a current family member", async () => {
    const s = await setUp();
    for (const [member, admin] of [[s.ben, true], [s.luis, false]] as const) {
      const before = await reload(member);
      const result = await refusal(
        addFamilyMember(db, fakeMailer().send, s.ana, { name: "Again", email: member.email, admin }),
      );
      expect(result?.status).toBe(409);
      expect(await reload(member)).toEqual(before);
    }
  });
});

describe("emails", () => {
  it("sends a request to join to admins only, and a new update to every family member", async () => {
    const s = await setUp();
    const requests = fakeMailer();
    await notifyInviteRequest(db, requests.sendMany, s.family);
    expect(requests.sent.map((e) => e.to).sort()).toEqual([s.ana.email, s.luis.email].sort());

    const updates = fakeMailer();
    await createUpdate(db, s.luis, { body: "News" }, updates.sendMany);
    expect(updates.sent.map((e) => e.to).sort()).toEqual([s.ana.email, s.ben.email].sort());
  });
});

describe("the database", () => {
  it("refuses an admin who isn't a family member", async () => {
    const s = await setUp();
    await expect(db.person.update({ where: { id: s.sam.id }, data: { isAdmin: true } })).rejects.toThrow();
    expect((await reload(s.sam)).isAdmin).toBe(false);
    // Promotion sets role and flag in one statement, which the check allows.
    await db.person.update({ where: { id: s.sam.id }, data: { role: "family", isAdmin: true, phone: null } });
    expect((await reload(s.sam)).isAdmin).toBe(true);
  });
});

describe("createFamily", () => {
  it("makes every member an admin", async () => {
    const family = await createFamily(db, {
      displayName: "The Rivera Family",
      inviteOnly: false,
      question: "What is the dog's name?",
      acceptedAnswers: ["Biscuit"],
      members: [
        { name: "Ana Rivera", email: "ana@example.com" },
        { name: "Luis Rivera", email: "luis@example.com" },
      ],
    });
    const people = await db.person.findMany({ where: { familyId: family.id } });
    expect(people).toHaveLength(2);
    expect(people.every((p) => p.role === "family" && p.isAdmin)).toBe(true);
  });
});
