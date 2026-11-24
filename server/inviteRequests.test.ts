import { expect, it } from "vitest";
import { RequestError } from "./errors.js";
import { MESSAGE_MAX, validMessage } from "./inviteRequests.js";

it("keeps a trimmed message and turns an empty or missing one into null", () => {
  expect(validMessage("  Hi, I'm a neighbor.  ")).toBe("Hi, I'm a neighbor.");
  for (const empty of [undefined, null, "", "   \n "]) expect(validMessage(empty)).toBeNull();
});

it("accepts a message of exactly the limit and refuses one longer or not text", () => {
  expect(validMessage("a".repeat(MESSAGE_MAX))).toHaveLength(MESSAGE_MAX);
  for (const bad of ["a".repeat(MESSAGE_MAX + 1), 5, {}, ["x"]]) {
    expect(() => validMessage(bad)).toThrow(RequestError);
  }
});
