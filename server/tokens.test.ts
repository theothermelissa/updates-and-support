import { expect, it } from "vitest";
import { hashToken, newToken } from "./tokens.js";

it("hashes deterministically", () => {
  expect(hashToken("abc")).toBe(hashToken("abc"));
  expect(hashToken("abc")).not.toBe(hashToken("abd"));
});

it("makes distinct 43-character URL-safe tokens", () => {
  const a = newToken();
  const b = newToken();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(a).not.toBe(b);
});
