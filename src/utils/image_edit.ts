import * as fabric from "fabric";

export type CropInsets = { left: number; top: number; right: number; bottom: number };

const clampPercent = (value: number) => Math.min(45, Math.max(0, value));

export const readCropInsets = (image: fabric.FabricImage): CropInsets => {
  const original = image.getOriginalSize();
  const width = original.width || 1;
  const height = original.height || 1;
  return {
    left: Math.round(((image.cropX ?? 0) / width) * 100),
    top: Math.round(((image.cropY ?? 0) / height) * 100),
    right: Math.round(Math.max(0, (width - (image.cropX ?? 0) - (image.width ?? width)) / width) * 100),
    bottom: Math.round(Math.max(0, (height - (image.cropY ?? 0) - (image.height ?? height)) / height) * 100),
  };
};

/** Apply percentage crop insets while preserving the displayed frame size and centre. */
export const applyCropInsets = (image: fabric.FabricImage, requested: CropInsets) => {
  const original = image.getOriginalSize();
  if (!original.width || !original.height) return;
  const insets = {
    left: clampPercent(requested.left),
    top: clampPercent(requested.top),
    right: clampPercent(requested.right),
    bottom: clampPercent(requested.bottom),
  };
  const frameWidth = image.getScaledWidth();
  const frameHeight = image.getScaledHeight();
  const center = image.getCenterPoint();
  const cropX = Math.round(original.width * insets.left / 100);
  const cropY = Math.round(original.height * insets.top / 100);
  const width = Math.max(1, Math.round(original.width * (100 - insets.left - insets.right) / 100));
  const height = Math.max(1, Math.round(original.height * (100 - insets.top - insets.bottom) / 100));

  image.set({ cropX, cropY, width, height });
  image.set({ scaleX: frameWidth / width, scaleY: frameHeight / height });
  image.setPositionByOrigin(center, "center", "center");
  image.setCoords();
};
