import { describe, expect, it } from "vitest";
import { findSmartSnap, insetBounds } from "./editor_layout";

describe("insetBounds", () => {
  it("creates a 90 percent safe area by default", () => {
    expect(insetBounds({ left: 10, top: 20, width: 200, height: 100 })).toEqual({
      left: 20,
      top: 25,
      width: 180,
      height: 90,
    });
  });
});

describe("findSmartSnap", () => {
  it("snaps edges and centres independently", () => {
    const result = findSmartSnap(
      { left: 47, top: 19, width: 20, height: 20 },
      [{ left: 50, top: 40, width: 40, height: 20 }],
      4,
    );
    expect(result).toEqual({ dx: 3, dy: 1, guideX: 50, guideY: 40 });
  });

  it("does not snap outside the threshold", () => {
    expect(findSmartSnap(
      { left: 0, top: 0, width: 10, height: 10 },
      [{ left: 30, top: 30, width: 10, height: 10 }],
      3,
    )).toEqual({ dx: 0, dy: 0, guideX: undefined, guideY: undefined });
  });
});
