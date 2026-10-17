import { describe, expect, it } from "vitest";
import { capacityLabel, isPast, sortRequests, whenLabel } from "./help.js";

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

// Noon on Friday, October 16, 2026, on this device's clock.
const now = new Date(2026, 9, 16, 12, 0);

describe("isPast", () => {
  it("makes a date alone past from the next day, and a date and time past from that time", () => {
    expect(isPast(null, null, now)).toBe(false);
    expect(isPast("2026-10-16", null, now)).toBe(false);
    expect(isPast("2026-10-16", null, new Date(2026, 9, 16, 23, 59))).toBe(false);
    expect(isPast("2026-10-16", null, new Date(2026, 9, 17, 0, 0))).toBe(true);
    expect(isPast("2026-10-15", null, now)).toBe(true);
    expect(isPast("2026-10-16", "11:59", now)).toBe(true);
    expect(isPast("2026-10-16", "12:00", now)).toBe(true);
    expect(isPast("2026-10-16", "12:01", now)).toBe(false);
  });
});

describe("sortRequests", () => {
  it("puts upcoming soonest first, then undated in order, then past most recent first", () => {
    const requests = [
      { id: "undated-old", date: null, time: null },
      { id: "past-week", date: "2026-10-09", time: null },
      { id: "sat-evening", date: "2026-10-17", time: "18:00" },
      { id: "undated-new", date: null, time: null },
      { id: "sat", date: "2026-10-17", time: null },
      { id: "today-morning", date: "2026-10-16", time: "09:00" },
      { id: "today", date: "2026-10-16", time: null },
      { id: "sat-morning", date: "2026-10-17", time: "08:30" },
      { id: "yesterday", date: "2026-10-15", time: null },
    ];
    expect(sortRequests(requests, now).map((r) => r.id)).toEqual([
      "today",
      "sat",
      "sat-morning",
      "sat-evening",
      "undated-old",
      "undated-new",
      "today-morning",
      "yesterday",
      "past-week",
    ]);
  });

  it("puts resolved requests after undated ones and before past ones, most recently resolved first", () => {
    const requests = [
      { id: "past", date: "2026-10-09", time: null, resolvedAt: null },
      { id: "resolved-past", date: "2026-10-09", time: null, resolvedAt: "2026-10-16T09:00:00.000Z" },
      { id: "undated", date: null, time: null, resolvedAt: null },
      { id: "resolved-undated", date: null, time: null, resolvedAt: "2026-10-14T09:00:00.000Z" },
      { id: "resolved-upcoming", date: "2026-10-17", time: null, resolvedAt: "2026-10-15T09:00:00.000Z" },
      { id: "upcoming", date: "2026-10-17", time: null, resolvedAt: null },
    ];
    expect(sortRequests(requests, now).map((r) => r.id)).toEqual([
      "upcoming",
      "undated",
      "resolved-past",
      "resolved-upcoming",
      "resolved-undated",
      "past",
    ]);
  });
});

describe("whenLabel", () => {
  it("shows the day, and the time when there is one", () => {
    expect(whenLabel("2026-10-17", null)).toBe("Sat, Oct 17");
    expect(whenLabel("2026-10-17", "17:30")).toBe("Sat, Oct 17 · 5:30 PM");
    expect(whenLabel("2026-10-17", "00:05")).toBe("Sat, Oct 17 · 12:05 AM");
  });
});
