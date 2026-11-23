import { expect, it } from "vitest";
import { audienceBody, changedAudience, choiceFor, EVERYONE, type AudienceChoice } from "./audience.js";

const groups = [
  { id: "g1", name: "Neighbors" },
  { id: "g2", name: "Work" },
];
const FAMILY: AudienceChoice = { mode: "family", ids: [] };

it("sends each choice as the server expects it", () => {
  expect(audienceBody(EVERYONE, groups)).toBe("everyone");
  expect(audienceBody(FAMILY, groups)).toBe("family");
  expect(audienceBody({ mode: "groups", ids: ["g2", "gone"] }, groups)).toEqual({ groups: ["g2"] });
});

it("sends no audience when an edit keeps a family-only update's audience", () => {
  // A group-deleted update on a regular family, which the server won't accept "family" for.
  const start = choiceFor({ groups: [] });
  expect(start).toEqual(FAMILY);
  expect(changedAudience(start, FAMILY, groups)).toBeUndefined();
});

it("sends family when an edit changes to family members only", () => {
  expect(changedAudience(EVERYONE, FAMILY, groups)).toBe("family");
  expect(changedAudience({ mode: "groups", ids: ["g1"] }, FAMILY, groups)).toBe("family");
});

it("sends the new audience when an edit leaves family members only", () => {
  expect(changedAudience(FAMILY, EVERYONE, groups)).toBe("everyone");
  expect(changedAudience(FAMILY, { mode: "groups", ids: ["g1"] }, groups)).toEqual({ groups: ["g1"] });
});

it("sends nothing for unchanged groups, in any order", () => {
  expect(changedAudience({ mode: "groups", ids: ["g1", "g2"] }, { mode: "groups", ids: ["g2", "g1"] }, groups)).toBeUndefined();
  expect(changedAudience(EVERYONE, EVERYONE, groups)).toBeUndefined();
});
