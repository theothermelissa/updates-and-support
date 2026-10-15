import { expect, it } from "vitest";
import { isValidEmail, isValidSlug } from "./families.js";

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
  for (const slug of ["for-ginger", "rivera-k3f9m2xq", "abc", "a1-b2-c3"]) {
    expect(isValidSlug(slug), slug).toBe(true);
  }
});

it("refuses addresses with capitals, spaces, stray hyphens, or the wrong length", () => {
  for (const slug of ["For-Ginger", "for ginger", "-ginger", "ginger-", "for--ginger", "for_ginger", "ab", "a".repeat(61), ""]) {
    expect(isValidSlug(slug), slug).toBe(false);
  }
});
