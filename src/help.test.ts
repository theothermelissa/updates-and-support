import { describe, expect, it } from "vitest";
import { capacityLabel, helpSummary } from "./help.js";

describe("capacityLabel", () => {
  it("says how many places a request has", () => {
    expect(capacityLabel(1)).toBe("1 person can help with this");
    expect(capacityLabel(4)).toBe("4 people can help with this");
    expect(capacityLabel(null)).toBe("Many people can help with this");
  });
});

describe("helpSummary", () => {
  it("names one or two people, then counts the rest", () => {
    expect(helpSummary(["Ana Rivera"])).toBe("Ana Rivera is helping");
    expect(helpSummary(["You"])).toBe("You are helping");
    expect(helpSummary(["You", "Sam"])).toBe("You and Sam are helping");
    expect(helpSummary(["Ana Rivera", "Sam", "Luis Rivera"])).toBe("Ana Rivera, Sam, and 1 other are helping");
    expect(helpSummary(["You", "Sam", "Luis Rivera", "Olu"])).toBe("You, Sam, and 2 others are helping");
  });
});
