import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Person } from "../../server/generated/prisma/client.js";
import { createNote, deleteNote, listNotes } from "../../server/notes.js";
import { addFamilyMember } from "../../server/people.js";
import { setReaction } from "../../server/reactions.js";
import { createUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { answerCorrectly, fakeMailer, joinWithEmail, makeFamily, makeGroup, resetDb, verifiedSupporter } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The Rivera family with groups A and B. Supporters a1 and a2 are in A, b1 in B, ab in both, u1
// and u2 in neither, unv is in A but hasn't verified their email, and ned has no email at all.
// Each leaves a note on update E, whose body is their name; Ana leaves one for everyone and one
// for family members only.
async function setUp() {
  const { family, people } = await makeFamily(db, "Rivera", ["Ana"]);
  const ana = people[0]!;
  const sup = (name: string) => verifiedSupporter(db, family, name);
  const a1 = await sup("Aiko");
  const a2 = await sup("Ayo");
  const b1 = await sup("Bexley");
  const ab = await sup("Abe");
  const u1 = await sup("Ulrich");
  const u2 = await sup("Una");
  const unv = (await joinWithEmail(db, family, "Vik")).person;
  const ned = (await answerCorrectly(db, family)).person;
  const A = await makeGroup(db, family.id, "Group A", [a1.id, a2.id, ab.id, unv.id]);
  const B = await makeGroup(db, family.id, "Group B", [b1.id, ab.id]);
  const e = await createUpdate(db, ana, { body: "Everyone news" });

  const note = (person: Person, body: string, extra: Record<string, unknown> = {}) =>
    createNote(db, person, {
      updateId: e.id,
      body,
      color: "sky",
      ...(person.role === "family" ? { audience: "everyone" } : {}),
      ...extra,
    });
  const notes = {
    ana: (await note(ana, "Ana-all")).note,
    anaFam: (await note(ana, "Ana-fam", { audience: "family" })).note,
    a1: (await note(a1, "Aiko-note")).note,
    a2: (await note(a2, "Ayo-note")).note,
    b1: (await note(b1, "Bexley-note")).note,
    ab: (await note(ab, "Abe-note")).note,
    u1: (await note(u1, "Ulrich-note")).note,
    u2: (await note(u2, "Una-note")).note,
    unv: (await note(unv, "Vik-note")).note,
    ned: (await note(ned, "Ned-note", { name: "Ned" })).note,
  };
  return { family, ana, a1, a2, b1, ab, u1, u2, unv, ned, A, B, e: e.id, notes };
}

// The bodies a reader sees on the update and on the wall, which must agree.
async function bodies(person: Person): Promise<string[]> {
  const feed = (await listUpdates(db, person)).flatMap((u) => u.notes.map((n) => n.body)).sort();
  const wall = (await listNotes(db, person)).map((n) => n.body).sort();
  expect(wall).toEqual(feed);
  return feed;
}

const sorted = (...b: string[]) => [...b].sort();

async function refusal(work: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await work;
  } catch (err) {
    const { status, message } = err as { status: number; message: string };
    return { status, message };
  }
  throw new Error("Expected a refusal");
}

describe("whose notes a reader sees", () => {
  it("shows each reader family members' notes, their own, and their group peers' (or the ungrouped's)", async () => {
    const s = await setUp();
    expect(await bodies(s.ana)).toEqual(sorted(...Object.values(s.notes).map((n) => n.body)));
    expect(await bodies(s.a1)).toEqual(sorted("Ana-all", "Aiko-note", "Ayo-note", "Abe-note"));
    expect(await bodies(s.b1)).toEqual(sorted("Ana-all", "Bexley-note", "Abe-note"));
    expect(await bodies(s.ab)).toEqual(sorted("Ana-all", "Aiko-note", "Ayo-note", "Bexley-note", "Abe-note"));
    const ungrouped = sorted("Ana-all", "Ulrich-note", "Una-note", "Vik-note", "Ned-note");
    expect(await bodies(s.u1)).toEqual(ungrouped);
    // An unverified member is in no group, so sees the same as someone in none.
    expect(await bodies(s.unv)).toEqual(ungrouped);
    expect(await bodies(s.ned)).toEqual(ungrouped);
  });

  it("shows every supporter every note when the family has no groups", async () => {
    const s = await setUp();
    await db.group.deleteMany({ where: { familyId: s.family.id } });
    const all = sorted(...Object.values(s.notes).map((n) => n.body).filter((b) => b !== "Ana-fam"));
    for (const reader of [s.a1, s.b1, s.u1, s.unv, s.ned]) expect(await bodies(reader)).toEqual(all);
  });

  it("is decided from current membership on every request", async () => {
    const s = await setUp();
    await db.groupMember.deleteMany({ where: { groupId: s.A.id, personId: s.a1.id } });
    expect(await bodies(s.a2)).toEqual(sorted("Ana-all", "Ayo-note", "Abe-note"));
    // a1 is now in no group.
    expect(await bodies(s.a1)).toEqual(sorted("Ana-all", "Aiko-note", "Ulrich-note", "Una-note", "Vik-note", "Ned-note"));

    await db.person.update({ where: { id: s.unv.id }, data: { emailVerifiedAt: new Date() } });
    expect(await bodies(s.unv)).toEqual(sorted("Ana-all", "Vik-note", "Ayo-note", "Abe-note"));

    await db.group.delete({ where: { id: s.A.id } });
    expect(await bodies(s.a2)).toContain("Ulrich-note");
  });
});

describe("notes for family members only", () => {
  it("reaches only family members, who see which they are", async () => {
    const s = await setUp();
    for (const reader of [s.a1, s.b1, s.u1, s.ned]) expect(await bodies(reader)).not.toContain("Ana-fam");
    const seen = (await listNotes(db, s.ana)).filter((n) => n.authorName.startsWith("Ana"));
    expect(seen.find((n) => n.body === "Ana-fam")?.familyOnly).toBe(true);
    expect(seen.find((n) => n.body === "Ana-all")?.familyOnly).toBe(false);
    // A supporter's view has no such field at all.
    const mine = (await listNotes(db, s.a1)).find((n) => n.body === "Aiko-note")!;
    expect(Object.keys(mine)).not.toContain("familyOnly");
  });

  it("is chosen by family members and refused for supporters", async () => {
    const s = await setUp();
    const before = await db.note.count();
    for (const audience of [undefined, "", "everybody", true]) {
      const e = await refusal(createNote(db, s.ana, { updateId: s.e, body: "x", color: "sky", audience }));
      expect(e.status).toBe(400);
    }
    expect((await refusal(createNote(db, s.a1, { updateId: s.e, body: "x", color: "sky", audience: "everyone" }))).status).toBe(400);
    expect((await refusal(createNote(db, s.a1, { updateId: s.e, body: "x", color: "sky", audience: "family" }))).status).toBe(400);
    expect(await db.note.count()).toBe(before);
    expect(await db.note.findFirstOrThrow({ where: { id: s.notes.ana.id } })).toMatchObject({ familyOnly: false });
    expect(await db.note.findFirstOrThrow({ where: { id: s.notes.anaFam.id } })).toMatchObject({ familyOnly: true });
  });
});

describe("a note a reader can't see is not found", () => {
  it("refuses reacting to or deleting it, like a note that doesn't exist", async () => {
    const s = await setUp();
    const missing = await refusal(setReaction(db, s.a1, { noteId: "no-such-note", kind: "heart" }));
    expect(missing.status).toBe(404);
    expect(await refusal(setReaction(db, s.a1, { noteId: s.notes.anaFam.id, kind: "heart" }))).toEqual(missing);
    expect(await refusal(setReaction(db, s.a1, { noteId: s.notes.b1.id, kind: "heart" }))).toEqual(missing);
    expect(await refusal(setReaction(db, s.u1, { noteId: s.notes.a2.id, kind: "heart" }))).toEqual(missing);
    expect((await refusal(deleteNote(db, s.a1, s.notes.anaFam.id))).status).toBe(404);
    expect(await db.noteReaction.count()).toBe(0);
  });

  it("lets an author who moved to another group delete their own note, and a family member delete any", async () => {
    const s = await setUp();
    await db.groupMember.deleteMany({ where: { personId: s.a1.id } });
    await db.groupMember.create({ data: { groupId: s.B.id, personId: s.a1.id } });
    await deleteNote(db, s.a1, s.notes.a1.id);
    await deleteNote(db, s.ana, s.notes.b1.id);
    expect(await db.note.count({ where: { id: { in: [s.notes.a1.id, s.notes.b1.id] } } })).toBe(0);
  });
});

describe("whose names appear on reactions", () => {
  async function reactAll(s: Awaited<ReturnType<typeof setUp>>, target: { noteId: string } | { updateId: string }) {
    // Written directly: someone can't react to a note they can't see now, but may have when they could.
    for (const p of [s.ana, s.a1, s.a2, s.b1, s.u1]) {
      if ("updateId" in target) await db.reaction.create({ data: { ...target, personId: p.id, kind: "heart" } });
      else await db.noteReaction.create({ data: { ...target, personId: p.id, kind: "heart" } });
    }
  }
  const namesOn = (list: { named: { name: string }[] }) => list.named.map((n) => n.name).sort();

  it("names only people the reader sees, on an update and a note, but counts everyone", async () => {
    const s = await setUp();
    await reactAll(s, { updateId: s.e });
    await reactAll(s, { noteId: s.notes.a2.id });
    await reactAll(s, { noteId: s.notes.ana.id });

    const feedA1 = await listUpdates(db, s.a1);
    const updateA1 = feedA1[0]!;
    expect(updateA1.reactions.count).toBe(5);
    expect(namesOn(updateA1.reactions)).toEqual(sorted("Ana Rivera", "Ayo"));
    const noteA1 = updateA1.notes.find((n) => n.body === "Ayo-note")!;
    expect(noteA1.reactions.count).toBe(5);
    expect(noteA1.reactions.mine).toBe("heart");
    expect(namesOn(noteA1.reactions)).toEqual(sorted("Ana Rivera", "Ayo"));
    const serialized = JSON.stringify([feedA1, await listNotes(db, s.a1)]);
    for (const hidden of ["Bexley", "Ulrich", "Group A", "Group B", s.b1.id, s.u1.id, s.b1.email!, s.u1.email!]) {
      expect(serialized).not.toContain(hidden);
    }

    // Someone in no group is named the ungrouped and family, not the group's people.
    const updateU2 = (await listUpdates(db, s.u2))[0]!;
    expect(namesOn(updateU2.reactions)).toEqual(sorted("Ana Rivera", "Ulrich"));
    // A family member sees every name.
    const updateAna = (await listUpdates(db, s.ana))[0]!;
    expect(namesOn(updateAna.reactions)).toEqual(sorted("Aiko", "Ayo", "Bexley", "Ulrich"));
  });

  it("counts and summarizes nothing from a hidden note", async () => {
    const s = await setUp();
    await reactAll(s, { noteId: s.notes.ana.id });
    await setReaction(db, s.ana, { noteId: s.notes.anaFam.id, kind: "heart" });
    const update = (await listUpdates(db, s.a1))[0]!;
    expect(update.notes.map((n) => n.body)).not.toContain("Ana-fam");
    expect(update.notes).toHaveLength(4);
    expect((await listNotes(db, s.a1)).filter((n) => n.updateId === s.e)).toHaveLength(4);
    expect(JSON.stringify(update)).not.toContain("Bexley");
  });
});

describe("promoting a supporter", () => {
  it("keeps their earlier notes private to family members, and their later ones public", async () => {
    const s = await setUp();
    expect(await bodies(s.a1)).toContain("Ayo-note");
    await addFamilyMember(db, fakeMailer().send, s.ana, { name: "Ayo", email: s.a2.email, admin: false });
    const promoted = await db.person.findUniqueOrThrow({ where: { id: s.a2.id } });
    expect(promoted.role).toBe("family");
    expect(await bodies(s.a1)).not.toContain("Ayo-note");
    expect(await bodies(s.ana)).toContain("Ayo-note");
    await createNote(db, promoted, { updateId: s.e, body: "Now family", color: "sky", audience: "everyone" });
    for (const reader of [s.a1, s.b1, s.u1]) expect(await bodies(reader)).toContain("Now family");
  });
});
