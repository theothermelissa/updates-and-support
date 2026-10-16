import { describe, expect, it } from "vitest";
import { capacityLabel } from "./help.js";

describe("capacityLabel", () => {
  it("says how many places a request has, and how many are left once someone offers", () => {
    expect(capacityLabel(null, 0)).toBe("everyone");
    expect(capacityLabel(null, 5)).toBe("everyone");
    expect(capacityLabel(1, 0)).toBe("1 person");
    expect(capacityLabel(4, 0)).toBe("4 people");
    expect(capacityLabel(4, 1)).toBe("4 people, need 3 more");
    expect(capacityLabel(4, 4)).toBe("4 people");
    expect(capacityLabel(2, 3)).toBe("2 people");
  });
});
