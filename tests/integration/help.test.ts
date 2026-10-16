import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import helpHandler from "../../api/f/[slug]/help/index.js";
import helpOneHandler from "../../api/f/[slug]/help/[id].js";
import offerHandler from "../../api/f/[slug]/help/[id]/offer.js";
import removeOfferHandler from "../../api/f/[slug]/help/[id]/offers/[offerId].js";
import { getDb } from "../../server/db.js";
import type { Person } from "../../server/generated/prisma/client.js";
import {
  createHelp,
  deleteHelp,
  hasHelpRequests,
  listHelp,
  offerHelp,
  removeOffer,
  updateHelp,
  type HelpRequestView,
} from "../../server/help.js";
import { setRemoved } from "../../server/people.js";
import { createTestDb } from "./db.js";
import { answerCorrectly, fakeMailer, joinWithEmail, makeFamily, queuedOrDone, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The Rivera family (Ana and Luis) with supporter Sam, and the Okafor family (Chidi)
// with supporter Olu.
async function setUp() {
  const { family, people } = await makeFamily(db, "Rivera", ["Ana", "Luis"]);
  const ana = people.find((p) => p.name === "Ana Rivera")!;
  const luis = people.find((p) => p.name === "Luis Rivera")!;
  const { family: okafor, people: okaforPeople } = await makeFamily(db, "Okafor", ["Chidi"]);
  const chidi = okaforPeople[0]!;
  const sam = await joinWithEmail(db, family, "Sam");
  const olu = await joinWithEmail(db, okafor, "Olu");
  return { family, okafor, ana, luis, chidi, sam: sam.person, samToken: sam.sessionToken, olu };
}

function add(person: Person, body = "A ride to the clinic", slots: number | null = 1) {
  return createHelp(db, person, { body, slots });
}

const names = (request: HelpRequestView) => request.offers.map((offer) => [offer.name, offer.mine]);

describe("who can write a request", () => {
  it("lets a family member add, edit, and delete, and keeps offers when the words change", async () => {
    const { ana, sam } = await setUp();
    const request = await add(ana, "First", 2);
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    const edited = await updateHelp(db, ana, request.id, { body: "Second", slots: 3 });
    expect(edited.body).toBe("Second");
    expect(edited.slots).toBe(3);
    expect(edited.offers).toHaveLength(1);
    expect(edited.full).toBe(false);

    await deleteHelp(db, ana, request.id);
    expect(await db.helpRequest.count()).toBe(0);
    expect(await db.helpOffer.count()).toBe(0);
  });

  it("refuses a supporter, and another family's member, and stores nothing", async () => {
    const { ana, sam, chidi } = await setUp();
    const request = await add(ana);
    await expect(add(sam)).rejects.toMatchObject({ status: 403 });
    await expect(updateHelp(db, sam, request.id, { body: "No", slots: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(deleteHelp(db, sam, request.id)).rejects.toMatchObject({ status: 403 });
    await expect(updateHelp(db, chidi, request.id, { body: "No", slots: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(deleteHelp(db, chidi, request.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.helpRequest.count()).toBe(1);
    expect((await listHelp(db, ana))[0]!.body).toBe("A ride to the clinic");
  });

  it("rejects an empty request, a bad number of places, and a 101st request", async () => {
    const { ana } = await setUp();
    for (const input of [
      { body: "  ", slots: 1 },
      { body: "Ok", slots: 0 },
      { body: "Ok", slots: 1.5 },
      { body: "Ok", slots: 100 },
      { body: "Ok", slots: "2" },
    ]) {
      await expect(createHelp(db, ana, input)).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.helpRequest.count()).toBe(0);
    for (let i = 0; i < 100; i++) await add(ana, `Request ${i}`, null);
    await expect(add(ana, "One more", null)).rejects.toMatchObject({ status: 400 });
  });
});

describe("who can see a request", () => {
  it("shows a family's requests only to that family, oldest first", async () => {
    const { ana, sam, olu } = await setUp();
    await add(ana, "First", null);
    await add(ana, "Second", 2);
    expect((await listHelp(db, sam)).map((r) => r.body)).toEqual(["First", "Second"]);
    expect(await listHelp(db, olu.person)).toEqual([]);
    const request = (await listHelp(db, ana))[0]!;
    await expect(offerHelp(db, undefined, olu.person, request.id, { helping: true })).rejects.toMatchObject({ status: 404 });
    expect(await db.helpOffer.count()).toBe(0);
    expect(await hasHelpRequests(db, sam.familyId)).toBe(true);
    expect(await hasHelpRequests(db, olu.person.familyId)).toBe(false);
  });

  it("sends names to a supporter, and the email and offer id only to a family member", async () => {
    const { ana, sam } = await setUp();
    const request = await add(ana, "Maple Street errand", 2);
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    const [forSam] = await listHelp(db, sam);
    const [forAna] = await listHelp(db, ana);

    expect(names(forSam!)).toEqual([["Sam", true]]);
    expect(forSam!.offers[0]!.email).toBeNull();
    expect(forSam!.offers[0]!.id).toBeNull();
    expect(forAna!.offers[0]!.email).toBe("sam@example.com");
    expect(forAna!.offers[0]!.id).toEqual(expect.any(String));

    for (const json of [JSON.stringify(forSam), JSON.stringify(forAna)]) {
      expect(json).not.toContain(sam.id);
      expect(json).not.toContain(ana.id);
    }
    expect(JSON.stringify(forSam)).not.toContain("sam@example.com");
    expect(JSON.stringify(forSam)).not.toContain(forAna!.offers[0]!.id!);
  });

  it("hides an offer from another family's person, and one whose author was removed", async () => {
    const { ana, sam, olu } = await setUp();
    const request = await add(ana, "One place", 1);
    await db.helpOffer.create({ data: { requestId: request.id, personId: olu.person.id } });
    expect((await listHelp(db, ana))[0]!.offers).toEqual([]);
    expect((await listHelp(db, ana))[0]!.full).toBe(false);

    await offerHelp(db, undefined, sam, request.id, { helping: true });
    await setRemoved(db, ana, sam.id, true);
    const hidden = (await listHelp(db, ana))[0]!;
    expect(hidden.offers).toEqual([]);
    expect(hidden.full).toBe(false);
    await expect(offerHelp(db, undefined, sam, request.id, { helping: true })).rejects.toMatchObject({ status: 403 });

    await setRemoved(db, ana, sam.id, false);
    const restored = (await listHelp(db, ana))[0]!;
    expect(restored.offers.map((o) => o.name)).toEqual(["Sam"]);
    expect(restored.full).toBe(true);
  });
});

describe("offering", () => {
  it("needs a name, keeps the name already on the record, and lets the person withdraw", async () => {
    const { ana, family } = await setUp();
    const request = await add(ana, "Prayers", null);
    const reader = await answerCorrectly(db, family);
    await expect(offerHelp(db, undefined, reader.person, request.id, { helping: true })).rejects.toMatchObject({ status: 400 });
    expect(await db.helpOffer.count()).toBe(0);

    await offerHelp(db, undefined, reader.person, request.id, { helping: true, name: "  Tess  " });
    const named = await db.person.findUniqueOrThrow({ where: { id: reader.person.id } });
    expect(named.name).toBe("Tess");
    await offerHelp(db, undefined, named, request.id, { helping: true, name: "Someone else" });
    expect((await db.person.findUniqueOrThrow({ where: { id: reader.person.id } })).name).toBe("Tess");

    const [listed] = await listHelp(db, named);
    expect(names(listed!)).toEqual([["Tess", true]]);
    expect(listed!.full).toBe(false);

    await offerHelp(db, undefined, named, request.id, { helping: false });
    expect((await listHelp(db, ana))[0]!.offers).toEqual([]);
  });

  it("puts the viewer first, covers a numbered request, and refuses one place too many", async () => {
    const { ana, luis, sam } = await setUp();
    const request = await add(ana, "Two people", 2);
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    await offerHelp(db, undefined, luis, request.id, { helping: true });

    const [forSam] = await listHelp(db, sam);
    expect(names(forSam!)).toEqual([
      ["Sam", true],
      ["Luis Rivera", false],
    ]);
    expect(forSam!.full).toBe(true);

    await expect(offerHelp(db, undefined, ana, request.id, { helping: true })).rejects.toMatchObject({ status: 409 });
    expect(await db.helpOffer.count()).toBe(2);

    await offerHelp(db, undefined, sam, request.id, { helping: false });
    expect((await listHelp(db, ana))[0]!.full).toBe(false);
    await offerHelp(db, undefined, ana, request.id, { helping: true });
    expect((await listHelp(db, ana))[0]!.full).toBe(true);
  });

  it("keeps both offers when the number drops below them, and never covers an open request", async () => {
    const { ana, sam, luis } = await setUp();
    const request = await add(ana, "Open", null);
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    await offerHelp(db, undefined, luis, request.id, { helping: true });
    expect((await listHelp(db, ana))[0]!.full).toBe(false);

    const lowered = await updateHelp(db, ana, request.id, { body: "Open", slots: 1 });
    expect(lowered.offers).toHaveLength(2);
    expect(lowered.full).toBe(true);
    await expect(offerHelp(db, undefined, ana, request.id, { helping: true })).rejects.toMatchObject({ status: 409 });
  });

  it("lets a family member remove any offer", async () => {
    const { ana, sam, chidi } = await setUp();
    const request = await add(ana);
    await offerHelp(db, undefined, sam, request.id, { helping: true });
    const offerId = (await listHelp(db, ana))[0]!.offers[0]!.id!;
    await expect(removeOffer(db, sam, request.id, offerId)).rejects.toMatchObject({ status: 403 });
    await expect(removeOffer(db, chidi, request.id, offerId)).rejects.toMatchObject({ status: 404 });
    expect(await db.helpOffer.count()).toBe(1);
    await removeOffer(db, ana, request.id, offerId);
    expect(await db.helpOffer.count()).toBe(0);
  });

  it("gives the last place to whichever offer lands first", async () => {
    const { ana, luis, sam } = await setUp();
    const request = await add(ana, "One place", 1);
    let competing!: Promise<unknown>;
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "HelpRequest" WHERE id = ${request.id} FOR UPDATE`;
        competing = offerHelp(db, undefined, sam, request.id, { helping: true });
        await queuedOrDone(db, competing, "transactionid");
        await tx.helpOffer.create({ data: { requestId: request.id, personId: luis.id } });
      },
      { timeout: 10_000 },
    );
    await expect(competing).rejects.toMatchObject({ status: 409 });
    const offers = await db.helpOffer.findMany();
    expect(offers.map((offer) => offer.personId)).toEqual([luis.id]);
  });
});

describe("emails", () => {
  it("tells the other family members when someone takes a numbered request, and nothing else", async () => {
    const { family, ana, luis, sam } = await setUp();
    const numbered = await add(ana, "the spare room on Maple", 2);
    const many = await add(ana, "Prayers", null);
    const mail = fakeMailer();

    await offerHelp(db, mail.sendMany, sam, numbered.id, { helping: true });
    expect(mail.sent.map((email) => email.to).sort()).toEqual(["ana.rivera@example.com", "luis.rivera@example.com"]);
    for (const email of mail.sent) {
      expect(email.text).not.toContain("Maple");
      expect(email.text).toContain(`/f/${family.slug}/help`);
      expect(email.subject).toContain("The Rivera Family");
    }

    const before = mail.sent.length;
    await offerHelp(db, mail.sendMany, sam, numbered.id, { helping: true });
    await offerHelp(db, mail.sendMany, sam, numbered.id, { helping: false });
    await offerHelp(db, mail.sendMany, sam, many.id, { helping: true });
    await offerHelp(db, mail.sendMany, luis, numbered.id, { helping: true });
    expect(mail.sent.slice(before).map((email) => email.to)).toEqual(["ana.rivera@example.com"]);

    mail.sent.length = 0;
    const failing: typeof mail.sendMany = async () => {
      throw new Error("mailbox unavailable");
    };
    await offerHelp(db, failing, ana, numbered.id, { helping: true });
    expect(await db.helpOffer.count({ where: { personId: ana.id } })).toBe(1);
  });
});

describe("the help endpoints", () => {
  const savedUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  });
  afterAll(async () => {
    await getDb().$disconnect();
    process.env.DATABASE_URL = savedUrl;
  });

  type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

  async function call(handler: Handler, method: string, query: Record<string, string>, cookies: Record<string, string>, body?: unknown) {
    const req = { method, query, headers: { "content-type": "application/json" }, cookies, body };
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

  it("refuses requests without this family's session, a wrong method, or an unknown family", async () => {
    const { family, ana, olu, samToken } = await setUp();
    const request = await add(ana);
    const slug = family.slug;
    const samCookie = { [`session_${slug}`]: samToken };
    const oluCookie = { [`session_${slug}`]: olu.sessionToken };
    const query = { slug, id: request.id, offerId: "none" };

    for (const cookies of [{}, oluCookie]) {
      expect(await call(helpHandler, "GET", { slug }, cookies)).toBe(401);
      expect(await call(helpHandler, "POST", { slug }, cookies, { body: "Hi", slots: 1 })).toBe(401);
      expect(await call(helpOneHandler, "PATCH", query, cookies, { body: "Hi", slots: 1 })).toBe(401);
      expect(await call(helpOneHandler, "DELETE", query, cookies)).toBe(401);
      expect(await call(offerHandler, "POST", query, cookies, { helping: true })).toBe(401);
      expect(await call(removeOfferHandler, "DELETE", query, cookies)).toBe(401);
    }
    expect(await call(helpHandler, "PUT", { slug }, samCookie, { body: "Hi", slots: 1 })).toBe(405);
    expect(await call(helpHandler, "GET", { slug: "no-such-family" }, samCookie)).toBe(404);
    expect(await db.helpRequest.count()).toBe(1);
  });
});
