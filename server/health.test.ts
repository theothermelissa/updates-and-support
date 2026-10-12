import { describe, expect, it } from "vitest";
import { checkHealth } from "./health.js";

describe("checkHealth", () => {
  it("reports up when the database answers", async () => {
    const db = { $queryRaw: async () => [{ "?column?": 1 }] };
    expect(await checkHealth(db)).toEqual({ ok: true, database: "up" });
  });

  it("reports down instead of throwing when the database fails", async () => {
    const db = {
      $queryRaw: async () => {
        throw new Error("connection refused");
      },
    };
    expect(await checkHealth(db)).toEqual({ ok: false, database: "down" });
  });
});
