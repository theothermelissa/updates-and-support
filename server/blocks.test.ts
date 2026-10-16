import { describe, expect, it } from "vitest";
import { blocksFrom, bodyOf, validBlocks } from "./blocks.js";

const t = (text: unknown) => ({ type: "text", text });

describe("validBlocks", () => {
  it("accepts one or several text blocks, trimmed", () => {
    expect(validBlocks([t(" Hello ")])).toEqual([{ type: "text", text: "Hello" }]);
    expect(validBlocks([t("One"), t("Two\nlines")])).toEqual([t("One"), t("Two\nlines")]);
  });

  it("refuses anything but an array of 1 to 20 blocks", () => {
    for (const input of [undefined, null, "text", {}, [], Array(21).fill(t("x"))]) {
      expect(() => validBlocks(input)).toThrow(expect.objectContaining({ status: 400 }));
    }
    expect(validBlocks(Array(20).fill(t("x")))).toHaveLength(20);
  });

  it("refuses blocks that aren't objects", () => {
    for (const block of [null, [], "text", 42]) {
      expect(() => validBlocks([block])).toThrow(expect.objectContaining({ status: 400 }));
    }
  });

  it("refuses empty, whitespace, or non-string text", () => {
    for (const text of ["", "  \n ", 42, null, undefined]) {
      expect(() => validBlocks([t("ok"), t(text)])).toThrow(expect.objectContaining({ status: 400 }));
    }
  });

  it("caps text at 20,000 characters in one block or spread across several", () => {
    expect(validBlocks([t("x".repeat(20_000))])).toHaveLength(1);
    expect(() => validBlocks([t("x".repeat(20_001))])).toThrow(expect.objectContaining({ status: 400 }));
    expect(validBlocks([t("x".repeat(10_000)), t("x".repeat(10_000))])).toHaveLength(2);
    expect(() => validBlocks([t("x".repeat(10_000)), t("x".repeat(10_001))])).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("refuses unknown types, extra keys, and photo blocks", () => {
    for (const block of [
      { type: "html", text: "x" },
      { text: "x" },
      { type: "text", text: "x", extra: 1 },
      { type: "photo", placeholder: true },
    ]) {
      expect(() => validBlocks([block])).toThrow(expect.objectContaining({ status: 400 }));
    }
  });
});

describe("blocksFrom", () => {
  it("uses only blocks when both are sent", () => {
    expect(blocksFrom({ blocks: [t("From blocks")], body: "From body" })).toEqual([t("From blocks")]);
    expect(() => blocksFrom({ blocks: [], body: "From body" })).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("turns a body into one text block, and refuses neither", () => {
    expect(blocksFrom({ body: " Old page " })).toEqual([t("Old page")]);
    expect(() => blocksFrom({ body: "  " })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => blocksFrom({})).toThrow(expect.objectContaining({ status: 400 }));
  });
});

it("bodyOf joins text blocks with blank lines", () => {
  expect(bodyOf([{ type: "text", text: "One" }, { type: "text", text: "Two" }])).toBe("One\n\nTwo");
});
