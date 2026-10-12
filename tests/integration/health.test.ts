import { afterAll, expect, it } from "vitest";
import { checkHealth } from "../../server/health.js";
import { createTestDb } from "./db.js";

const db = createTestDb();
afterAll(() => db.$disconnect());

it("reaches the real database through Prisma", async () => {
  expect(await checkHealth(db)).toEqual({ ok: true, database: "up" });
});
