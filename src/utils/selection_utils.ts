import * as fabric from "fabric";

export type SelectionAlignment = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";
export type SelectionDistribution = "horizontal" | "vertical";
export type AlignmentBounds = { left: number; top: number; width: number; height: number };

type Bounds = ReturnType<fabric.FabricObject["getBoundingRect"]>;

const moveBy = (object: fabric.FabricObject, x: number, y: number) => {
  const position = object.getXY();
  object.setXY(new fabric.Point(position.x + x, position.y + y));
  object.setCoords();
};

export const alignmentOffset = (
  bounds: AlignmentBounds,
  target: AlignmentBounds,
  alignment: SelectionAlignment,
): fabric.Point => {
  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;
  if (alignment === "left") return new fabric.Point(target.left - bounds.left, 0);
  if (alignment === "center-h") {
    return new fabric.Point(target.left + target.width / 2 - (bounds.left + bounds.width / 2), 0);
  }
  if (alignment === "right") return new fabric.Point(targetRight - (bounds.left + bounds.width), 0);
  if (alignment === "top") return new fabric.Point(0, target.top - bounds.top);
  if (alignment === "center-v") {
    return new fabric.Point(0, target.top + target.height / 2 - (bounds.top + bounds.height / 2));
  }
  return new fabric.Point(0, targetBottom - (bounds.top + bounds.height));
};

export const alignObjectToBounds = (
  object: fabric.FabricObject,
  target: AlignmentBounds,
  alignment: SelectionAlignment,
) => {
  const offset = alignmentOffset(object.getBoundingRect(), target, alignment);
  moveBy(object, offset.x, offset.y);
  object.canvas?.renderAll();
};

const selectionBounds = (bounds: Bounds[]) => {
  const left = Math.min(...bounds.map((value) => value.left));
  const top = Math.min(...bounds.map((value) => value.top));
  const right = Math.max(...bounds.map((value) => value.left + value.width));
  const bottom = Math.max(...bounds.map((value) => value.top + value.height));
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
};

const finish = (selection: fabric.ActiveSelection) => {
  selection.triggerLayout();
  selection.getObjects().forEach((object) => object.setCoords());
  selection.setCoords();
  selection.canvas?.renderAll();
};

export const alignActiveSelection = (selection: fabric.ActiveSelection, alignment: SelectionAlignment) => {
  const objects = selection.getObjects();
  if (objects.length < 2) return;
  const bounds = objects.map((object) => object.getBoundingRect());
  const target = selectionBounds(bounds);

  objects.forEach((object, index) => {
    const box = bounds[index];
    if (alignment === "left") moveBy(object, target.left - box.left, 0);
    else if (alignment === "center-h") moveBy(object, target.centerX - (box.left + box.width / 2), 0);
    else if (alignment === "right") moveBy(object, target.right - (box.left + box.width), 0);
    else if (alignment === "top") moveBy(object, 0, target.top - box.top);
    else if (alignment === "center-v") moveBy(object, 0, target.centerY - (box.top + box.height / 2));
    else moveBy(object, 0, target.bottom - (box.top + box.height));
  });

  finish(selection);
};

export const distributeActiveSelection = (
  selection: fabric.ActiveSelection,
  distribution: SelectionDistribution,
) => {
  const objects = selection.getObjects();
  if (objects.length < 3) return;
  const entries = objects.map((object) => ({ object, bounds: object.getBoundingRect() }));

  if (distribution === "horizontal") {
    entries.sort((a, b) => a.bounds.left - b.bounds.left);
    const first = entries[0].bounds.left;
    const last = entries.at(-1)!.bounds;
    const span = last.left + last.width - first;
    const gap = (span - entries.reduce((sum, entry) => sum + entry.bounds.width, 0)) / (entries.length - 1);
    let cursor = first;
    entries.forEach((entry) => {
      moveBy(entry.object, cursor - entry.bounds.left, 0);
      cursor += entry.bounds.width + gap;
    });
  } else {
    entries.sort((a, b) => a.bounds.top - b.bounds.top);
    const first = entries[0].bounds.top;
    const last = entries.at(-1)!.bounds;
    const span = last.top + last.height - first;
    const gap = (span - entries.reduce((sum, entry) => sum + entry.bounds.height, 0)) / (entries.length - 1);
    let cursor = first;
    entries.forEach((entry) => {
      moveBy(entry.object, 0, cursor - entry.bounds.top);
      cursor += entry.bounds.height + gap;
    });
  }

  finish(selection);
};
