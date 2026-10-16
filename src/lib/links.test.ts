import { expect, it } from "vitest";
import { linkify } from "./links.js";

it("links http and https addresses and keeps the surrounding text", () => {
  expect(linkify("Meal train: https://example.com/meals?id=1. Thanks!\nAlso http://example.org")).toEqual([
    { text: "Meal train: " },
    { href: "https://example.com/meals?id=1" },
    { text: ". Thanks!\nAlso " },
    { href: "http://example.org" },
  ]);
});

it("returns plain text unchanged", () => {
  expect(linkify("No links here.")).toEqual([{ text: "No links here." }]);
});

it("does not link other schemes", () => {
  expect(linkify("javascript:alert(1) data:text/html,hi mailto:a@example.com")).toEqual([
    { text: "javascript:alert(1) data:text/html,hi mailto:a@example.com" },
  ]);
});
