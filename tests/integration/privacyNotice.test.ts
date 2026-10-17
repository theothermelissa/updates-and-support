import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listPeople, setPrivacyNotice } from "../../server/people.js";
import { createTestDb } from "./db.js";
import { joinWithEmail, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

// The Rivera family (Ana) with supporter Sam, and the Okafor family (Chidi).
async function setUp() {
  const { family, people: [ana] } = await makeFamily(db, "Rivera");
  const { family: okafor } = await makeFamily(db, "Okafor", ["Chidi"]);
  const sam = await joinWithEmail(db, family, "Sam");
  return { family, okafor, ana: ana!, sam: sam.person };
}

const noticeOf = async (id: string) => (await db.family.findUniqueOrThrow({ where: { id } })).privacyNotice;

describe("the privacy banner's wording", () => {
  it("is saved by a family member for their own family only", async () => {
    const { family, okafor, ana } = await setUp();
    await setPrivacyNotice(db, ana, { privacyNotice: "Please keep Sam's news private." });
    expect((await listPeople(db, ana)).privacyNotice).toBe("Please keep Sam's news private.");
    expect(await noticeOf(family.id)).toBe("Please keep Sam's news private.");
    expect(await noticeOf(okafor.id)).toBeNull();
  });

  it("refuses a supporter, storing nothing", async () => {
    const { family, sam } = await setUp();
    await expect(setPrivacyNotice(db, sam, { privacyNotice: "Share freely!" })).rejects.toMatchObject({ status: 403 });
    expect(await noticeOf(family.id)).toBeNull();
  });

  it("keeps one line, returns to the standard wording when empty, and refuses bad input", async () => {
    const { family, ana } = await setUp();
    expect(await setPrivacyNotice(db, ana, { privacyNotice: "  Please\n\nkeep   this private.  " })).toEqual({
      privacyNotice: "Please keep this private.",
    });
    expect(await setPrivacyNotice(db, ana, { privacyNotice: " \n " })).toEqual({ privacyNotice: null });
    expect(await noticeOf(family.id)).toBeNull();

    await expect(setPrivacyNotice(db, ana, { privacyNotice: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(setPrivacyNotice(db, ana, {})).rejects.toMatchObject({ status: 400 });
    await expect(setPrivacyNotice(db, ana, { privacyNotice: "x".repeat(301) })).rejects.toMatchObject({ status: 400 });
    expect(await noticeOf(family.id)).toBeNull();
    await setPrivacyNotice(db, ana, { privacyNotice: "x".repeat(300) });
    expect(await noticeOf(family.id)).toHaveLength(300);
  });
});
