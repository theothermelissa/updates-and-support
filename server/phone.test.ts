import { describe, expect, it } from "vitest";
import { validPhone } from "./phone.js";

describe("validPhone", () => {
  it("keeps common forms as typed, after trimming", () => {
    for (const phone of ["555-0102", "(555) 010-2030", "+1 555.010.2030", "+44 20 7946 0958", "+353 1 234 5678"]) {
      expect(validPhone(` ${phone} `)).toBe(phone);
    }
  });

  it("gives null for an empty box", () => {
    expect(validPhone("")).toBeNull();
    expect(validPhone("   ")).toBeNull();
  });

  it("refuses letters, too few or too many digits, too long, and non-strings", () => {
    for (const phone of ["555-CALL-NOW", "555 0102 ext 4", "12345", "1234567890123456", `1234567${" ".repeat(30)}8`, null, 5550102]) {
      expect(() => validPhone(phone)).toThrow("valid phone number");
    }
  });
});
