<script lang="ts">
  import * as fabric from "fabric";
  import type { CustomCanvas } from "$/fabric-object/custom_canvas";
  import { TextboxExt } from "$/fabric-object/textbox-ext";
  import Barcode from "$/fabric-object/barcode";
  import QRCode from "$/fabric-object/qrcode";
  import { isObjectLocked, setObjectLocked, type LayerObject } from "$/utils/layer_utils";

  interface Props {
    canvas?: CustomCanvas;
    revision: number;
    selection: fabric.FabricObject | null;
    onChanged: () => void;
    onSelected: (object: fabric.FabricObject | null) => void;
  }

  let { canvas, revision, selection, onChanged, onSelected }: Props = $props();

  const layers = $derived.by(() => {
    void revision;
    return canvas ? [...canvas.getObjects()].reverse() : [];
  });

  const kindName = (object: fabric.FabricObject) => {
    if (object instanceof TextboxExt) return "Text";
    if (object instanceof fabric.FabricImage) return "Image";
    if (object instanceof Barcode) return "Barcode";
    if (object instanceof QRCode) return "QR code";
    if (object instanceof fabric.Group) return "Group";
    if (object instanceof fabric.Circle) return "Circle";
    if (object instanceof fabric.Polyline) return "Line";
    if (object instanceof fabric.Rect) return "Rectangle";
    return "Object";
  };

  const layerName = (object: fabric.FabricObject) =>
    (object as LayerObject).name?.trim() || kindName(object);

  const rename = (object: fabric.FabricObject, value: string) => {
    (object as LayerObject).name = value.trim() || undefined;
    onChanged();
  };

  const toggleVisible = (object: fabric.FabricObject) => {
    object.set("visible", !object.visible);
    if (!object.visible && canvas?.getActiveObjects().includes(object)) {
      canvas.discardActiveObject();
      onSelected(null);
    }
    onChanged();
  };

  const toggleLocked = (object: fabric.FabricObject) => {
    const locked = !isObjectLocked(object);
    setObjectLocked(object, locked);
    if (locked && canvas?.getActiveObjects().includes(object)) {
      canvas.discardActiveObject();
      onSelected(null);
    }
    onChanged();
  };

  const selectLayer = (object: fabric.FabricObject) => {
    if (!canvas || !object.visible || isObjectLocked(object)) return;
    canvas.discardActiveObject();
    canvas.setActiveObject(object);
    canvas.renderAll();
    onSelected(object);
  };

  const move = (object: fabric.FabricObject, direction: "up" | "down" | "front" | "back") => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const index = objects.indexOf(object);
    const target = direction === "front"
      ? objects.length - 1
      : direction === "back"
        ? 0
        : direction === "up"
          ? Math.min(objects.length - 1, index + 1)
          : Math.max(0, index - 1);
    if (index === target) return;
    canvas.moveObjectTo(object, target);
    onChanged();
  };
</script>

<aside class="layers">
  <div class="head">
    <b>Layers</b>
    <span>{layers.length}</span>
  </div>
  <div class="list">
    {#key revision}
      {#if layers.length === 0}
        <p class="empty">No objects</p>
      {/if}
      {#each layers as object (object)}
        <div class="layer" class:selected={selection === object} class:muted={!object.visible}>
        <div class="select">
          <button class="pick" onclick={() => selectLayer(object)} disabled={!object.visible || isObjectLocked(object)} title={`Select ${layerName(object)}`}>
            <span class="kind">{kindName(object)}</span>
          </button>
          <input value={layerName(object)} aria-label="Layer name" onchange={(event) => rename(object, event.currentTarget.value)} />
        </div>
        <div class="actions">
          <button class:on={object.visible} onclick={() => toggleVisible(object)} title={object.visible ? "Hide layer" : "Show layer"}>{object.visible ? "VIS" : "HID"}</button>
          <button class:on={isObjectLocked(object)} onclick={() => toggleLocked(object)} title={isObjectLocked(object) ? "Unlock layer" : "Lock layer"}>{isObjectLocked(object) ? "LCK" : "UNL"}</button>
        </div>
        <div class="order">
          <button onclick={() => move(object, "front")} title="Bring to front">Top</button>
          <button onclick={() => move(object, "up")} title="Move forward">Up</button>
          <button onclick={() => move(object, "down")} title="Move backward">Down</button>
          <button onclick={() => move(object, "back")} title="Send to back">Bottom</button>
        </div>
        </div>
      {/each}
    {/key}
  </div>
</aside>

<style>
  .layers {
    width: 226px;
    flex: none;
    min-height: 0;
    background: var(--raised);
    border-left: 1.5px solid var(--ink);
    display: flex;
    flex-direction: column;
  }

  /* Mobile: full-width strip between the canvas and the properties sheet. */
  @media (max-width: 768px) {
    .layers {
      order: 2;
      width: 100%;
      max-height: 34vh;
      border-left: 0;
      border-top: 1.5px solid var(--ink);
    }
  }

  .head {
    height: 38px;
    padding: 0 12px;
    border-bottom: 1.5px solid var(--ink);
    background: var(--paper);
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-transform: uppercase;
  }

  .head b { font-size: 11px; letter-spacing: 1px; }
  .head span, .kind { font: 9px var(--font-mono); color: var(--ink-3); }
  .list { overflow-y: auto; min-height: 0; }
  .empty { padding: 14px; color: var(--ink-3); font-size: 12px; }
  .layer { padding: 8px; border-bottom: 1px solid var(--line); }
  .layer.selected { background: var(--paper-2); box-shadow: inset 3px 0 var(--blue); }
  .layer.muted { opacity: 0.58; }

  .select {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .pick { border: 0; background: transparent; padding: 4px; cursor: pointer; }
  .pick:disabled { cursor: default; opacity: .5; }

  .select input {
    min-width: 0;
    flex: 1;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: var(--ink);
    font: 600 11.5px var(--font-ui);
    padding: 4px;
  }

  .select input:focus { outline: none; border-color: var(--line-2); background: var(--raised); }
  .actions, .order { display: flex; gap: 4px; margin-top: 5px; }
  .actions button, .order button {
    flex: 1;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    background: var(--raised);
    color: var(--ink-3);
    padding: 4px 2px;
    font: 9px var(--font-mono);
    cursor: pointer;
  }
  .actions button.on { color: var(--ink); border-color: var(--ink); }
  .order button:hover, .actions button:hover { color: var(--ink); border-color: var(--ink); }
</style>
