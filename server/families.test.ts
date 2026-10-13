import { expect, it } from "vitest";
import { isValidEmail } from "./families.js";

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
