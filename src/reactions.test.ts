import { describe, expect, it } from "vitest";
import { whoReacted } from "./reactions.js";

describe("whoReacted", () => {
  it("names up to the limit and counts the rest", () => {
    expect(whoReacted(["Ana Rivera"], false, 1, 2)).toBe("Ana Rivera");
    expect(whoReacted(["Ana Rivera", "Sam Friend"], false, 2, 2)).toBe("Ana Rivera and Sam Friend");
    expect(whoReacted(["Ana Rivera", "Sam Friend", "Tess Neighbor"], false, 3, 2)).toBe(
      "Ana Rivera, Sam Friend and 1 other",
    );
    expect(whoReacted(["Ana Rivera", "Sam Friend", "Tess Neighbor"], false, 6, 2)).toBe(
      "Ana Rivera, Sam Friend and 4 others",
    );
  });

  it("puts You first", () => {
    expect(whoReacted([], true, 1, 2)).toBe("You");
    expect(whoReacted(["Ana Rivera"], true, 2, 2)).toBe("You and Ana Rivera");
    expect(whoReacted(["Ana Rivera", "Sam Friend"], true, 6, 2)).toBe("You, Ana Rivera and 4 others");
  });

  it("counts nameless readers without naming them", () => {
    expect(whoReacted(["Ana Rivera"], false, 3)).toBe("Ana Rivera and 2 others");
    expect(whoReacted([], false, 1)).toBe("1 person");
    expect(whoReacted([], false, 3)).toBe("3 people");
  });

  it("lists every name without a limit", () => {
    expect(whoReacted(["Ana Rivera", "Sam Friend", "Tess Neighbor"], true, 5)).toBe(
      "You, Ana Rivera, Sam Friend, Tess Neighbor and 1 other",
    );
  });
});
