import { describe, expect, it, vi } from "vitest";
import { findLargestFittingFontSize } from "$/utils/text_fit";

describe("findLargestFittingFontSize", () => {
  it("returns the largest fitting whole-pixel size", () => {
    expect(findLargestFittingFontSize((size) => size <= 73, 2, 400)).toBe(73);
  });

  it("uses a logarithmic number of measurements", () => {
    const fits = vi.fn((size: number) => size <= 120);

    expect(findLargestFittingFontSize(fits, 2, 1000)).toBe(120);
    expect(fits.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it("falls back to the minimum size when nothing fits", () => {
    expect(findLargestFittingFontSize(() => false, 3, 100)).toBe(3);
  });
});
