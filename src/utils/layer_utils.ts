import * as fabric from "fabric";

export type LayerObject = fabric.FabricObject & {
  name?: string;
  labelDeskLocked?: boolean;
};

export const isObjectLocked = (object: fabric.FabricObject) =>
  Boolean((object as LayerObject).labelDeskLocked);

export const setObjectLocked = (object: fabric.FabricObject, locked: boolean) => {
  (object as LayerObject).labelDeskLocked = locked;
  object.set({
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
  });
  object.setCoords();
};

export const restoreObjectLock = (object: fabric.FabricObject) => {
  if (isObjectLocked(object)) setObjectLocked(object, true);
};
