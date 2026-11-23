import { expect, it } from "vitest";
import { gateInfo } from "./gate.js";
import type { Family } from "./generated/prisma/client.js";

function family(inviteOnly: boolean) {
  return {
    slug: "okafor-k3f9m2xq",
    displayName: "The Okafor Family",
    question: inviteOnly ? "" : "What is the dog's name?",
    inviteOnly,
  } as Family;
}

it("gives a visitor an invite-only family's name and address, and no question", () => {
  expect(gateInfo(family(true))).toEqual({
    displayName: "The Okafor Family",
    slug: "okafor-k3f9m2xq",
    home: "/f/okafor-k3f9m2xq",
    inviteOnly: true,
  });
});

it("gives a visitor any other family's question", () => {
  expect(gateInfo(family(false))).toEqual({
    displayName: "The Okafor Family",
    slug: "okafor-k3f9m2xq",
    home: "/f/okafor-k3f9m2xq",
    inviteOnly: false,
    question: "What is the dog's name?",
  });
});
