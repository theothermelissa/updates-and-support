import { describe, expect, it } from "vitest";
import { applyFetched, newUpdatesLabel } from "./liveFeed.js";

const u = (id: string, text = id) => ({ id, text });

describe("applyFetched", () => {
  it("keeps shown updates with their fetched content, in fetched order", () => {
    const { visible } = applyFetched(new Set(["a", "b"]), [u("b", "edited"), u("a")]);
    expect(visible).toEqual([u("b", "edited"), u("a")]);
  });

  it("drops a deleted update", () => {
    expect(applyFetched(new Set(["a", "b"]), [u("b")]).visible).toEqual([u("b")]);
  });

  it("holds back and counts new updates", () => {
    expect(applyFetched(new Set(["a"]), [u("c"), u("b"), u("a")])).toEqual({ visible: [u("a")], waiting: 2 });
  });

  it("stops counting a new update deleted before it was shown", () => {
    const shown = new Set(["a"]);
    expect(applyFetched(shown, [u("b"), u("a")]).waiting).toBe(1);
    expect(applyFetched(shown, [u("a")]).waiting).toBe(0);
  });
});

describe("newUpdatesLabel", () => {
  it("says one or many", () => {
    expect(newUpdatesLabel(1)).toBe("1 new update");
    expect(newUpdatesLabel(3)).toBe("3 new updates");
  });
});
