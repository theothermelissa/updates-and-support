import { expect, it } from "vitest";
import { dropsAnAnswer, isCorrectAnswer, normalizeAnswer } from "./answers.js";

it("normalizes case, spacing, and a leading 'the'", () => {
  expect(normalizeAnswer("  The   Maple\tStreet ")).toBe("maple street");
  expect(normalizeAnswer("Theodore")).toBe("theodore");
});

it("accepts any accepted answer after normalization", () => {
  const accepted = ["Maple", "Maple Street"];
  expect(isCorrectAnswer("maple", accepted)).toBe(true);
  expect(isCorrectAnswer("the  MAPLE street", accepted)).toBe(true);
  expect(isCorrectAnswer("Oak", accepted)).toBe(false);
});

it("never accepts an empty answer", () => {
  expect(isCorrectAnswer("   ", ["", "Maple"])).toBe(false);
});

it("notices an answer that stops working, and nothing else", () => {
  expect(dropsAnAnswer(["Maple"], ["Oak"])).toBe(true);
  expect(dropsAnAnswer(["Maple", "Oak"], ["Oak"])).toBe(true);
  expect(dropsAnAnswer(["Maple"], ["Maple", "Maple Street"])).toBe(false);
  expect(dropsAnAnswer(["Maple", "Oak"], ["oak", " the MAPLE "])).toBe(false);
});
