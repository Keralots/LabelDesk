export type EditorBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SmartSnapResult = {
  dx: number;
  dy: number;
  guideX?: number;
  guideY?: number;
};

export const SAFE_AREA_INSET_RATIO = 0.05;

export const insetBounds = (
  bounds: EditorBounds,
  ratio = SAFE_AREA_INSET_RATIO,
): EditorBounds => {
  const insetX = bounds.width * ratio;
  const insetY = bounds.height * ratio;
  return {
    left: bounds.left + insetX,
    top: bounds.top + insetY,
    width: Math.max(0, bounds.width - insetX * 2),
    height: Math.max(0, bounds.height - insetY * 2),
  };
};

const horizontalPoints = (bounds: EditorBounds) => [
  bounds.left,
  bounds.left + bounds.width / 2,
  bounds.left + bounds.width,
];

const verticalPoints = (bounds: EditorBounds) => [
  bounds.top,
  bounds.top + bounds.height / 2,
  bounds.top + bounds.height,
];

const closestOffset = (moving: number[], targets: number[], threshold: number) => {
  let best: { offset: number; guide: number } | undefined;
  for (const source of moving) {
    for (const target of targets) {
      const offset = target - source;
      if (Math.abs(offset) > threshold) continue;
      if (!best || Math.abs(offset) < Math.abs(best.offset)) best = { offset, guide: target };
    }
  }
  return best;
};

/** Find the smallest edge/centre correction on each axis. */
export const findSmartSnap = (
  moving: EditorBounds,
  targets: EditorBounds[],
  threshold: number,
): SmartSnapResult => {
  const x = closestOffset(horizontalPoints(moving), targets.flatMap(horizontalPoints), threshold);
  const y = closestOffset(verticalPoints(moving), targets.flatMap(verticalPoints), threshold);
  return {
    dx: x?.offset ?? 0,
    dy: y?.offset ?? 0,
    guideX: x?.guide,
    guideY: y?.guide,
  };
};
