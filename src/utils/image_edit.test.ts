import { describe, expect, it, vi } from "vitest";
import * as fabric from "fabric";
import { applyCropInsets, readCropInsets } from "./image_edit";

const mockImage = () => {
  const state = { cropX: 0, cropY: 0, width: 100, height: 50, scaleX: 2, scaleY: 2 };
  const image = {
    ...state,
    getOriginalSize: () => ({ width: 100, height: 50 }),
    getScaledWidth: () => image.width * image.scaleX,
    getScaledHeight: () => image.height * image.scaleY,
    getCenterPoint: () => new fabric.Point(50, 25),
    set(values: Partial<typeof state>) { Object.assign(image, values); return image; },
    setPositionByOrigin: vi.fn(),
    setCoords: vi.fn(),
  };
  return image as unknown as fabric.FabricImage;
};

describe("image crop helpers", () => {
  it("reads crop insets as percentages", () => {
    const image = mockImage();
    image.cropX = 10;
    image.cropY = 5;
    image.width = 70;
    image.height = 35;
    expect(readCropInsets(image)).toEqual({ left: 10, top: 10, right: 20, bottom: 20 });
  });

  it("preserves the displayed frame while applying crop", () => {
    const image = mockImage();
    applyCropInsets(image, { left: 10, top: 10, right: 10, bottom: 10 });
    expect({ cropX: image.cropX, cropY: image.cropY, width: image.width, height: image.height }).toEqual({
      cropX: 10,
      cropY: 5,
      width: 80,
      height: 40,
    });
    expect(image.scaleX).toBe(2.5);
    expect(image.scaleY).toBe(2.5);
  });
});
