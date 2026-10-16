import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHelp, listHelp, offerHelp } from "../../server/help.js";
import type { Person } from "../../server/generated/prisma/client.js";
import { addFamilyMember, listPeople } from "../../server/people.js";
import { setOwnPhone } from "../../server/phone.js";
import { createTestDb } from "./db.js";
import { answerCorrectly, fakeMailer, joinWithEmail, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const PHONE = "(555) 010-2030";

// The Rivera family (Ana and Luis) with supporters Sam and Tess, and the Okafor family
// (Chidi) with supporter Olu.
async function setUp() {
  const { family, people } = await makeFamily(db, "Rivera", ["Ana", "Luis"]);
  const ana = people.find((p) => p.name === "Ana Rivera")!;
  const luis = people.find((p) => p.name === "Luis Rivera")!;
  const { family: okafor, people: okaforPeople } = await makeFamily(db, "Okafor", ["Chidi"]);
  const sam = (await joinWithEmail(db, family, "Sam")).person;
  const tess = (await joinWithEmail(db, family, "Tess")).person;
  const olu = (await joinWithEmail(db, okafor, "Olu")).person;
  return { family, ana, luis, chidi: okaforPeople[0]!, sam, tess, olu };
}

function add(person: Person, extra: { requirePhone?: boolean; requireName?: boolean } = {}) {
  return createHelp(db, person, {
    body: "A ride to the clinic",
    slots: 3,
    requireName: true,
    requireEmail: false,
    requirePhone: false,
    date: null,
    time: null,
    ...extra,
  });
}

const phoneOf = async (person: Person) => (await db.person.findUniqueOrThrow({ where: { id: person.id } })).phone;

describe("setting your own phone number", () => {
  it("sets, changes, and clears only the signed-in supporter's number", async () => {
    const { sam, tess } = await setUp();
    expect(await setOwnPhone(db, sam, ` ${PHONE} `)).toMatchObject({ phone: PHONE });
    expect(await setOwnPhone(db, sam, "+44 20 7946 0958")).toMatchObject({ phone: "+44 20 7946 0958" });
    expect(await phoneOf(tess)).toBeNull();
    expect(await setOwnPhone(db, sam, "  ")).toMatchObject({ phone: null });
  });

  it("refuses a bad number without changing the one on the record", async () => {
    const { sam } = await setUp();
    await setOwnPhone(db, sam, PHONE);
    for (const phone of ["call me", "12345", undefined, 5550102030]) {
      await expect(setOwnPhone(db, sam, phone)).rejects.toMatchObject({ status: 400 });
    }
    expect(await phoneOf(sam)).toBe(PHONE);
  });

  it("refuses a family member, a removed supporter, and a supporter promoted since signing in", async () => {
    const { ana, sam, tess } = await setUp();
    await expect(setOwnPhone(db, ana, PHONE)).rejects.toMatchObject({ status: 403 });
    await db.person.update({ where: { id: tess.id }, data: { removedAt: new Date() } });
    await expect(setOwnPhone(db, tess, PHONE)).rejects.toMatchObject({ status: 403 });
    // sam is the session's copy from before the promotion.
    await addFamilyMember(db, fakeMailer().send, ana, { name: "Sam Friend", email: sam.email });
    await expect(setOwnPhone(db, sam, PHONE)).rejects.toMatchObject({ status: 403 });
    for (const person of [ana, sam, tess]) expect(await phoneOf(person)).toBeNull();
  });
});

describe("who sees a phone number", () => {
  it("shows a supporter's number beside their offer to the family only", async () => {
    const { ana, chidi, sam, tess, olu } = await setUp();
    await setOwnPhone(db, sam, PHONE);
    const request = await add(ana);
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    await offerHelp(db, undefined, tess, request.id, { helping: true });
    const sammed = await db.person.findUniqueOrThrow({ where: { id: sam.id } });

    expect((await listHelp(db, ana))[0]!.offers.map((o) => [o.name, o.phone])).toEqual([
      ["Sam", PHONE],
      ["Tess", null],
    ]);
    const forSam = await listHelp(db, sammed);
    expect(forSam[0]!.offers).toEqual([expect.objectContaining({ mine: true, phone: null })]);
    for (const viewer of [sammed, tess, olu, chidi]) {
      expect(JSON.stringify(await listHelp(db, viewer))).not.toContain(PHONE);
    }
  });

  it("lists supporters' numbers on the People page", async () => {
    const { ana, sam } = await setUp();
    await setOwnPhone(db, sam, PHONE);
    const people = await listPeople(db, ana);
    expect(people.supporters.map((s) => [s.name, s.phone])).toEqual([
      ["Tess", null],
      ["Sam", PHONE],
    ]);
  });

  it("clears the number when a supporter becomes a family member, and never shows a family member's", async () => {
    const { ana, sam } = await setUp();
    await setOwnPhone(db, sam, PHONE);
    const request = await add(ana);
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    await addFamilyMember(db, fakeMailer().send, ana, { name: "Sam Friend", email: sam.email });

    expect(await phoneOf(sam)).toBeNull();
    expect((await listHelp(db, ana))[0]!.offers.map((o) => [o.name, o.phone])).toEqual([["Sam Friend", null]]);
    // The database itself refuses a family member's phone number.
    await expect(db.person.update({ where: { id: ana.id }, data: { phone: PHONE } })).rejects.toThrow();
  });
});

describe("offering on a request that requires a phone number", () => {
  it("asks a supporter without one, and stores nothing until it's valid", async () => {
    const { ana, family } = await setUp();
    const request = await add(ana, { requirePhone: true });
    const reader = await answerCorrectly(db, family);
    for (const phone of [undefined, "", "not a phone"]) {
      await expect(
        offerHelp(db, undefined, reader.person, request.id, { helping: true, name: "Bea", phone }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.helpOffer.count()).toBe(0);
    const unchanged = await db.person.findUniqueOrThrow({ where: { id: reader.person.id } });
    expect([unchanged.name, unchanged.phone]).toEqual([null, null]);

    await offerHelp(db, undefined, reader.person, request.id, { helping: true, name: "Bea", phone: PHONE });
    const saved = await db.person.findUniqueOrThrow({ where: { id: reader.person.id } });
    expect([saved.name, saved.phone]).toEqual(["Bea", PHONE]);
    expect(await db.helpOffer.count()).toBe(1);
  });

  it("keeps a number already on the record, and keeps it after withdrawing", async () => {
    const { ana, sam } = await setUp();
    await setOwnPhone(db, sam, PHONE);
    const request = await add(ana, { requirePhone: true });
    await offerHelp(db, undefined, sam, request.id, { helping: true, phone: "555 999 0000" });
    expect(await phoneOf(sam)).toBe(PHONE);
    await offerHelp(db, undefined, sam, request.id, { helping: false });
    expect(await phoneOf(sam)).toBe(PHONE);
  });

  it("doesn't ask a family member, or a supporter who offered before it was required", async () => {
    const { ana, luis, sam } = await setUp();
    const request = await add(ana);
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    await db.helpRequest.update({ where: { id: request.id }, data: { requirePhone: true } });

    await offerHelp(db, undefined, luis, request.id, { helping: true });
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    expect(await db.helpOffer.count()).toBe(2);
    await offerHelp(db, undefined, sam, request.id, { helping: false });
    expect(await db.helpOffer.count()).toBe(1);
    expect([await phoneOf(luis), await phoneOf(sam)]).toEqual([null, null]);
  });

  it("stores no number it didn't ask for", async () => {
    const { ana, sam } = await setUp();
    const request = await add(ana);
    await offerHelp(db, undefined, sam, request.id, { helping: true, phone: PHONE });
    expect(await phoneOf(sam)).toBeNull();
  });
});
