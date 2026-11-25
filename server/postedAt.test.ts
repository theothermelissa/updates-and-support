import { describe, expect, it } from "vitest";
import { parsePostedAt } from "./postedAt.js";

const now = new Date("2026-11-25T12:00:00Z");

describe("parsePostedAt", () => {
  it("leaves an absent value alone", () => {
    expect(parsePostedAt(undefined, now)).toBeUndefined();
  });

  it("accepts the limits and anything between", () => {
    expect(parsePostedAt("1900-01-01T00:00:00.000Z", now)).toEqual(new Date("1900-01-01T00:00:00Z"));
    expect(parsePostedAt("1970-01-01T00:00:00.000Z", now)).toEqual(new Date(0));
    expect(parsePostedAt("2026-11-25T12:00:00.000Z", now)).toEqual(now);
  });

  it.each([
    "1899-12-31T23:59:59.999Z",
    "2026-11-25T12:00:00.001Z",
    "not a date",
    "2024-13-45T00:00:00Z",
    "2024-05-01",
    "",
    1700000000000,
    null,
    {},
  ])("refuses %j", (value) => {
    expect(() => parsePostedAt(value, now)).toThrowError(/between 1900 and now/);
  });
});
