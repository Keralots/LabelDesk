import * as fabric from "fabric";
import { describe, expect, it } from "vitest";
import {
  alignActiveSelection,
  alignObjectToBounds,
  alignmentOffset,
  distributeActiveSelection,
} from "$/utils/selection_utils";

const box = (left: number, top: number, width = 20, height = 20) =>
  new fabric.Rect({ left, top, width, height, strokeWidth: 0 });

const closeTo = (values: number[]) => {
  const target = values[0];
  values.forEach((value) => expect(value).toBeCloseTo(target, 5));
};

describe("active selection layout", () => {
  it("calculates offsets to every edge and center of a target", () => {
    const bounds = { left: 30, top: 40, width: 20, height: 10 };
    const target = { left: 0, top: 0, width: 100, height: 80 };

    expect(alignmentOffset(bounds, target, "left")).toEqual(new fabric.Point(-30, 0));
    expect(alignmentOffset(bounds, target, "center-h")).toEqual(new fabric.Point(10, 0));
    expect(alignmentOffset(bounds, target, "right")).toEqual(new fabric.Point(50, 0));
    expect(alignmentOffset(bounds, target, "top")).toEqual(new fabric.Point(0, -40));
    expect(alignmentOffset(bounds, target, "center-v")).toEqual(new fabric.Point(0, -5));
    expect(alignmentOffset(bounds, target, "bottom")).toEqual(new fabric.Point(0, 30));
  });

  it("aligns a rotated object by its visible bounding box", () => {
    const object = box(30, 20, 40, 10);
    object.rotate(30);

    alignObjectToBounds(object, { left: 0, top: 0, width: 120, height: 80 }, "right");

    const bounds = object.getBoundingRect();
    expect(bounds.left + bounds.width).toBeCloseTo(120, 5);
  });

  it("aligns object bounding boxes without changing their sizes", () => {
    const objects = [box(10, 10, 20, 10), box(70, 35, 40, 20), box(150, 60, 30, 30)];
    const selection = new fabric.ActiveSelection(objects);
    const widths = objects.map((object) => object.getBoundingRect().width);

    alignActiveSelection(selection, "center-h");

    closeTo(objects.map((object) => {
      const bounds = object.getBoundingRect();
      return bounds.left + bounds.width / 2;
    }));
    expect(objects.map((object) => object.getBoundingRect().width)).toEqual(widths);
  });

  it("distributes three objects with equal horizontal gaps", () => {
    const objects = [box(0, 0, 20), box(60, 0, 40), box(180, 0, 20)];
    const selection = new fabric.ActiveSelection(objects);

    distributeActiveSelection(selection, "horizontal");

    const bounds = objects.map((object) => object.getBoundingRect()).sort((a, b) => a.left - b.left);
    const gaps = [
      bounds[1].left - (bounds[0].left + bounds[0].width),
      bounds[2].left - (bounds[1].left + bounds[1].width),
    ];
    expect(gaps[0]).toBeCloseTo(gaps[1], 5);
  });

  it("leaves a two-object selection unchanged when distributing", () => {
    const objects = [box(0, 0), box(80, 0)];
    const selection = new fabric.ActiveSelection(objects);
    const before = objects.map((object) => object.getXY());

    distributeActiveSelection(selection, "horizontal");

    expect(objects.map((object) => object.getXY())).toEqual(before);
  });
});
