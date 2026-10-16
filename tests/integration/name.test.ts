import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setOwnName } from "../../server/name.js";
import { createNote, listNotes } from "../../server/notes.js";
import { setReaction } from "../../server/reactions.js";
import { createUpdate, listUpdates } from "../../server/updates.js";
import { createTestDb } from "./db.js";
import { joinWithEmail, makeFamily, resetDb } from "./fixtures.js";

const db = createTestDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

describe("changing your name", () => {
  it("stores a trimmed name and re-signs that person's notes, reactions, and updates", async () => {
    const { family, people: [ana, ben] } = await makeFamily(db, "Rivera", ["Ana", "Ben"]);
    const sam = await joinWithEmail(db, family, "Sam");
    const update = await createUpdate(db, ana!, { body: "News" });
    await createNote(db, sam.person, { updateId: update.id, body: "Hi", color: "sky" });
    await setReaction(db, sam.person, { updateId: update.id, kind: "hug" });

    expect(await setOwnName(db, sam.person, " Tess Neighbor ")).toMatchObject({ name: "Tess Neighbor" });
    expect(await setOwnName(db, ana!, "Ana R.")).toMatchObject({ name: "Ana R." });

    const [shown] = await listUpdates(db, ben!);
    expect(shown).toMatchObject({
      authorName: "Ana R.",
      reactions: { named: [{ name: "Tess Neighbor", kind: "hug" }] },
    });
    expect((await listNotes(db, ben!)).map((n) => n.authorName)).toEqual(["Tess Neighbor"]);
    expect((await db.person.findUniqueOrThrow({ where: { id: ben!.id } })).name).toBe("Ben Rivera");
  });

  it("refuses an empty, blank, or too-long name, changing nothing", async () => {
    const { people: [ana] } = await makeFamily(db, "Rivera");
    for (const name of ["", "   ", "x".repeat(101), undefined]) {
      await expect(setOwnName(db, ana!, name)).rejects.toMatchObject({ status: 400 });
    }
    expect((await db.person.findUniqueOrThrow({ where: { id: ana!.id } })).name).toBe("Ana Rivera");
  });

  it("saving the same name leaves it as it was", async () => {
    const { people: [ana] } = await makeFamily(db, "Rivera");
    await setOwnName(db, ana!, "Ana Rivera");
    expect((await db.person.findUniqueOrThrow({ where: { id: ana!.id } })).name).toBe("Ana Rivera");
  });
});
