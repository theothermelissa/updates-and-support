import { describe, expect, it } from "vitest";
import { choosePhoto, MAX_PHOTO_BYTES, needsShrink } from "./photos.js";

const original = "original";
const shrunk = "shrunk";
const big = MAX_PHOTO_BYTES + 1;

describe("choosePhoto", () => {
  it("uploads the shrunk photo whatever the original's size", () => {
    expect(choosePhoto({ isGif: false, size: big, shrunk, original })).toEqual({ photo: shrunk });
  });
  it("uploads a small original when shrinking failed", () => {
    expect(choosePhoto({ isGif: false, size: 1000, shrunk: null, original })).toEqual({ photo: original });
  });
  it("refuses a large original when shrinking failed", () => {
    expect(choosePhoto({ isGif: false, size: big, shrunk: null, original })).toHaveProperty("error");
  });
  it("uploads a small GIF as it is, even if a shrunk copy exists", () => {
    expect(choosePhoto({ isGif: true, size: 1000, shrunk, original })).toEqual({ photo: original });
  });
  it("refuses a GIF over the limit", () => {
    expect(choosePhoto({ isGif: true, size: big, shrunk: null, original })).toHaveProperty("error");
  });
});

describe("needsShrink", () => {
  it("leaves a photo that is narrow and small as it is", () => {
    expect(needsShrink(1600, 1000)).toBe(false);
  });
  it("shrinks a photo wider than 1600 pixels", () => {
    expect(needsShrink(1601, 1000)).toBe(true);
  });
  it("shrinks a narrow photo that is over 10 MB", () => {
    expect(needsShrink(800, MAX_PHOTO_BYTES + 1)).toBe(true);
  });
});
