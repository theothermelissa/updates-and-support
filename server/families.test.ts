import { expect, it } from "vitest";
import { familyRedirects, isValidEmail, isValidSlug, rootFamilySlug } from "./families.js";

it("accepts ordinary addresses", () => {
  for (const email of ["sam@example.com", "sam+supporter@gmail.com", "a.b@mail.example.co.uk", "x@ab.io"]) {
    expect(isValidEmail(email), email).toBe(true);
  }
});

it("refuses addresses that can't be real", () => {
  for (const email of ["juice@no", "sam@", "@example.com", "sam@example.", "sam@.com", "sam@example..com", "sam @example.com", "sam@example.c", "a@b@example.com"]) {
    expect(isValidEmail(email), email).toBe(false);
  }
});

it("accepts addresses of lowercase words joined by single hyphens", () => {
  for (const slug of ["for-sam", "rivera-k3f9m2xq", "abc", "a1-b2-c3"]) {
    expect(isValidSlug(slug), slug).toBe(true);
  }
});

it("refuses addresses with capitals, spaces, stray hyphens, or the wrong length", () => {
  for (const slug of ["For-Sam", "for sam", "-sam", "sam-", "for--sam", "for_sam", "ab", "a".repeat(61), ""]) {
    expect(isValidSlug(slug), slug).toBe(false);
  }
});

it("reads old-to-new address pairs, ignoring malformed ones", () => {
  const redirects = familyRedirects(" Okafor-K3F9M2XQ = for-sam , bad, a=, =b, x-y=x-y, one=two=three, constructor=for-sam ");
  expect([...redirects]).toEqual([
    ["okafor-k3f9m2xq", "for-sam"],
    ["constructor", "for-sam"],
  ]);
  expect(redirects.get("toString")).toBeUndefined();
  expect(familyRedirects("").size).toBe(0);
});

it("reads the root family's address only when it's valid", () => {
  expect(rootFamilySlug(" For-Sam ")).toBe("for-sam");
  for (const setting of ["", "for sam", "a"]) expect(rootFamilySlug(setting), setting).toBeNull();
});
