import { expect, it } from "vitest";
import { makeSlug } from "./slug.js";

it("uses the first word after a leading 'The' plus an 8-character suffix", () => {
  expect(makeSlug("The Rivera Family")).toMatch(/^rivera-[a-z0-9]{8}$/);
  expect(makeSlug("Rivera Family")).toMatch(/^rivera-[a-z0-9]{8}$/);
});

it("strips accents and punctuation", () => {
  expect(makeSlug("The O'Brién Family")).toMatch(/^obrien-[a-z0-9]{8}$/);
});

it("falls back to 'family' when nothing usable is left", () => {
  expect(makeSlug("The 王家")).toMatch(/^family-[a-z0-9]{8}$/);
  expect(makeSlug("   ")).toMatch(/^family-[a-z0-9]{8}$/);
});

it("makes a different suffix each time", () => {
  expect(makeSlug("Rivera")).not.toBe(makeSlug("Rivera"));
});
