import { describe, expect, it } from "vitest";
import { summary, summaryLabel, whoReacted, type Reactions } from "./reactions.js";

const reactions = (r: Partial<Reactions>): Reactions => ({ count: 0, kinds: [], mine: null, named: [], ...r });

describe("summary", () => {
  it("gives up to three emoji, most-used first", () => {
    expect(summary(reactions({ count: 2, kinds: ["heart", "strong"] }))).toBe("❤️💪");
    expect(summary(reactions({ count: 7, kinds: ["heart", "pray", "laugh", "hug"] }))).toBe("❤️🙏😂");
  });

  it("puts the total in the accessible name", () => {
    expect(summaryLabel(reactions({ count: 1, kinds: ["heart"] }))).toBe("1 reaction. Show who reacted");
    expect(summaryLabel(reactions({ count: 7, kinds: ["heart"] }))).toBe("7 reactions. Show who reacted");
  });
});

describe("whoReacted", () => {
  it("puts You first, then named people, then counts nameless readers", () => {
    const r = reactions({
      count: 5,
      mine: "heart",
      named: [
        { name: "Ana Rivera", kind: "pray" },
        { name: "Sam Friend", kind: "heart" },
      ],
    });
    expect(whoReacted(r)).toEqual(["You ❤️", "Ana Rivera 🙏", "Sam Friend ❤️", "and 2 others"]);
    expect(whoReacted({ ...r, count: 4 })).toEqual(["You ❤️", "Ana Rivera 🙏", "Sam Friend ❤️", "and 1 other"]);
  });

  it("lists only named people when everyone has a name", () => {
    expect(whoReacted(reactions({ count: 1, named: [{ name: "Ana Rivera", kind: "hug" }] }))).toEqual(["Ana Rivera 🤗"]);
  });

  it("counts nameless readers when no one is named", () => {
    expect(whoReacted(reactions({ count: 1 }))).toEqual(["1 person"]);
    expect(whoReacted(reactions({ count: 3 }))).toEqual(["3 people"]);
  });
});
