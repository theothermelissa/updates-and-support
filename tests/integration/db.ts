import { createDb } from "../../server/db.js";

export function createTestDb() {
  return createDb(process.env.TEST_DATABASE_URL!);
}
