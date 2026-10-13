import { expect, it } from "vitest";
import { networkKey } from "./network.js";

it("keeps an IPv4 address as is", () => {
  expect(networkKey("203.0.113.7")).toBe("203.0.113.7");
});

it("reduces IPv6 to its /64, however it's written", () => {
  expect(networkKey("2001:0db8:0000:0042:abcd:0000:0000:0001")).toBe("2001:db8:0:42::/64");
  expect(networkKey("2001:db8:0:42::1")).toBe("2001:db8:0:42::/64");
  expect(networkKey("2001:db8:0:42:ffff:1:2:3")).toBe("2001:db8:0:42::/64");
  expect(networkKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  expect(networkKey("::1")).toBe("0:0:0:0::/64");
});

it("treats an IPv4 address in IPv6 form as IPv4", () => {
  expect(networkKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
});

it("falls back to 'unknown' for an empty address", () => {
  expect(networkKey("")).toBe("unknown");
});
