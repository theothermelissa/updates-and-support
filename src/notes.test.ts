import { expect, it } from "vitest";
import { COLORS, contrast, PALETTE, randomColor } from "./notes.js";

it("matches the server's color keys", () => {
  expect(COLORS).toEqual(["sky", "teal", "sage", "oak", "rose", "lavender"]);
});

it("gives every color text that meets WCAG AA contrast on its fill", () => {
  for (const { fill, text } of Object.values(PALETTE)) expect(contrast(fill, text)).toBeGreaterThanOrEqual(4.5);
});

it("computes contrast like WCAG", () => {
  expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21);
  expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
});

it("picks only palette colors, across the whole range", () => {
  expect(randomColor(() => 0)).toBe("sky");
  expect(randomColor(() => 0.9999)).toBe("lavender");
});
