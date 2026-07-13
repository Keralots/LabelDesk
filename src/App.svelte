<script lang="ts">
  import { onMount } from "svelte";
  import * as fabric from "fabric";
  import { CustomCanvas } from "$/fabric-object/custom_canvas";
  import { TextboxExt } from "$/fabric-object/textbox-ext";
  import Barcode from "$/fabric-object/barcode";
  import QRCode from "$/fabric-object/qrcode";
  import ToolRail, { type ToolKind } from "$/components/ToolRail.svelte";
  import PropsPanel from "$/components/PropsPanel.svelte";
  import { FileUtils } from "$/utils/file_utils";
  import {
    DEFAULT_LABEL_PROPS,
    OBJECT_DEFAULTS,
    OBJECT_DEFAULTS_TEXT,
    OBJECT_DEFAULTS_VECTOR,
  } from "$/defaults";
  import PrintDialog from "$/components/PrintDialog.svelte";
  import LibraryDialog from "$/components/LibraryDialog.svelte";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import { UndoRedo } from "$/utils/undo_redo";
  import { ExportedLabelTemplateSchema } from "$/types";
  import type { ExportedLabelTemplate, LabelProps } from "$/types";
  import { connect, disconnect, connectionState, printerName, heartbeat } from "$/printer";
  import type { FabricJson } from "$/types";

  let canvasEl: HTMLCanvasElement;
  let canvas: CustomCanvas | undefined;
  let zoomPercent = $state(100);
  let selection = $state<fabric.FabricObject | null>(null);
  let rev = $state(0);
  let undoDisabled = $state(true);
  let redoDisabled = $state(true);
  let labelProps = $state<LabelProps>({
    printDirection: DEFAULT_LABEL_PROPS.printDirection,
    size: { ...DEFAULT_LABEL_PROPS.size },
  });

  const DPMM = 8; // 203 dpi

  const undoRedo = new UndoRedo();

  /** Resize the label (dimensions in millimetres). Undoable. */
  const applyLabelSize = (widthMm: number, heightMm: number) => {
    if (!canvas) return;
    const width = Math.round(widthMm * DPMM);
    const height = Math.round(heightMm * DPMM);
    if (width <= 0 || height <= 0) return;
    if (width === labelProps.size.width && height === labelProps.size.height) return;
    labelProps = { ...labelProps, size: { width, height } };
    canvas.setLabelProps(labelProps);
    canvas.setLabelSize(width, height);
    rev++;
    commit();
  };

  /** Update non-dimension label properties (shape, split, mirror). Undoable. */
  const updateLabelProps = (patch: Partial<LabelProps>) => {
    if (!canvas) return;
    labelProps = { ...labelProps, ...patch };
    canvas.setLabelProps(labelProps);
    canvas.renderAll();
    rev++;
    commit();
  };

  const refreshCanvas = () => {
    canvas?.renderAll();
    rev++;
  };

  /** Snapshot the current canvas into undo history. No-op while paused (during restore). */
  const commit = () => {
    if (canvas) undoRedo.push(canvas, labelProps);
  };

  /** Prop-panel edits mutate objects programmatically (no fabric event), so commit explicitly. */
  const onPropChanged = () => {
    refreshCanvas();
    commit();
  };

  const undo = () => void undoRedo.undo();
  const redo = () => void undoRedo.redo();

  const addObject = async (kind: ToolKind) => {
    if (!canvas) return;
    let obj: fabric.FabricObject | undefined;

    if (kind === "text") {
      obj = new TextboxExt("Text", { ...OBJECT_DEFAULTS_TEXT, fontSize: 24 });
    } else if (kind === "barcode") {
      obj = new Barcode({ ...OBJECT_DEFAULTS, text: "123456789", encoding: "CODE128B", scaleFactor: 2 });
    } else if (kind === "qrcode") {
      obj = new QRCode({ ...OBJECT_DEFAULTS, text: "https://example.com", size: 60 });
    } else if (kind === "rect") {
      obj = new fabric.Rect({ ...OBJECT_DEFAULTS_VECTOR, width: 60, height: 40 });
    } else if (kind === "circle") {
      obj = new fabric.Circle({ ...OBJECT_DEFAULTS_VECTOR, radius: 24 });
    } else if (kind === "line") {
      obj = new fabric.Polyline(
        [
          { x: 0, y: 0 },
          { x: 80, y: 0 },
        ],
        { ...OBJECT_DEFAULTS_VECTOR },
      );
    } else if (kind === "image") {
      try {
        const fileList = await FileUtils.pickFileAsync("*", false);
        const dataUrl = await FileUtils.blobToDataUrl(fileList[0]);
        const img = await fabric.FabricImage.fromURL(dataUrl);
        // fit into the label, leaving a small margin
        const maxW = labelProps.size.width * 0.8;
        const maxH = labelProps.size.height * 0.8;
        const scale = Math.min(maxW / (img.width ?? 1), maxH / (img.height ?? 1), 1);
        img.scale(scale);
        obj = img;
      } catch (e) {
        console.error("Image load failed:", e);
        return;
      }
    }

    if (!obj) return;
    canvas.add(obj);
    canvas.centerObject(obj);
    canvas.setActiveObject(obj);
    refreshCanvas();
    commit();
  };

  const deleteSelection = () => {
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    canvas.discardActiveObject();
    active.forEach((o) => canvas?.remove(o));
    refreshCanvas();
    commit();
  };

  const duplicateSelection = async () => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    const clone = await active.clone();
    clone.set({ left: (clone.left ?? 0) + 10, top: (clone.top ?? 0) + 10 });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    refreshCanvas();
    commit();
  };

  // Arrow-key nudge. Moves are coalesced into one undo step per key press (see onKeyup).
  let nudgePending = false;
  const nudge = (dx: number, dy: number) => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy });
    active.setCoords();
    canvas.renderAll();
    rev++;
    nudgePending = true;
  };
  const onKeyup = () => {
    if (nudgePending) {
      nudgePending = false;
      commit();
    }
  };

  const onKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const inField = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    const active = canvas?.getActiveObject();
    const editingText = active instanceof fabric.IText && active.isEditing;

    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      if (inField || editingText) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      if (inField || editingText) return;
      e.preventDefault();
      redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
      if (inField || editingText || !active) return;
      e.preventDefault();
      duplicateSelection();
      return;
    }

    if (!inField && !editingText && active && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") nudge(-step, 0);
      else if (e.key === "ArrowRight") nudge(step, 0);
      else if (e.key === "ArrowUp") nudge(0, -step);
      else if (e.key === "ArrowDown") nudge(0, step);
      return;
    }

    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (inField || editingText) return;
    if (active) {
      e.preventDefault();
      deleteSelection();
    }
  };

  const onConnectClick = async () => {
    if ($connectionState === "connected") {
      await disconnect();
      return;
    }
    try {
      await connect();
    } catch (e) {
      console.error("Connect failed:", e);
    }
  };

  let printDialogOpen = $state(false);
  let libraryOpen = $state(false);

  const getCanvasJson = (): FabricJson => canvas!.toJSON() as FabricJson;

  const saveLabelToLibrary = (title: string) => {
    if (!canvas) return;
    const tpl = FileUtils.makeExportedLabel(canvas, labelProps, false);
    if (title) tpl.title = title;
    const existing = LocalStoragePersistence.loadLabels();
    LocalStoragePersistence.saveLabels([...existing, tpl]);
  };

  const loadTemplate = async (tpl: ExportedLabelTemplate) => {
    if (!canvas) return;
    undoRedo.paused = true;
    canvas.discardActiveObject();
    selection = null;
    if (tpl.label?.size) {
      labelProps = { ...tpl.label, size: { ...tpl.label.size } };
      canvas.setLabelProps(labelProps);
      canvas.setLabelSize(labelProps.size.width, labelProps.size.height);
    }
    await FileUtils.loadCanvasState(canvas, tpl.canvas);
    canvas.renderAll();
    rev++;
    undoRedo.paused = false;
    commit();
  };

  const exportLabelJson = () => {
    if (!canvas) return;
    FileUtils.saveLabelAsJson(FileUtils.makeExportedLabel(canvas, labelProps, false));
  };

  const importLabelJson = async () => {
    try {
      const text = await FileUtils.pickAndReadSingleTextFile("json");
      const tpl = ExportedLabelTemplateSchema.parse(JSON.parse(text));
      await loadTemplate(tpl);
      libraryOpen = false;
    } catch (e) {
      console.error("Import failed:", e);
    }
  };

  onMount(() => {
    canvas = new CustomCanvas(canvasEl, {
      width: labelProps.size.width,
      height: labelProps.size.height,
    });
    canvas.setLabelProps(labelProps);
    canvas.onZoomChange = (zoom) => {
      zoomPercent = Math.round(zoom * 100);
    };

    canvas.on("selection:created", (e) => (selection = e.selected?.[0] ?? null));
    canvas.on("selection:updated", (e) => (selection = e.selected?.[0] ?? null));
    canvas.on("selection:cleared", () => (selection = null));
    // Fires for transforms (move/scale/rotate) and inline text edits that changed content.
    canvas.on("object:modified", () => {
      rev++;
      commit();
    });

    undoRedo.onStateUpdate = (s) => {
      undoDisabled = s.undoDisabled;
      redoDisabled = s.redoDisabled;
    };
    undoRedo.onLabelUpdate = async (data) => {
      if (!canvas) return;
      undoRedo.paused = true;
      canvas.discardActiveObject();
      selection = null;
      if (data.label) {
        const resized =
          data.label.size.width !== labelProps.size.width ||
          data.label.size.height !== labelProps.size.height;
        labelProps = { ...data.label, size: { ...data.label.size } };
        canvas.setLabelProps(labelProps);
        if (resized) canvas.setLabelSize(labelProps.size.width, labelProps.size.height);
      }
      await FileUtils.loadCanvasState(canvas, data.canvas);
      canvas.renderAll();
      rev++;
      undoRedo.paused = false;
    };

    // OBJECT_DEFAULTS_TEXT uses center origin - left/top are the CENTER point
    const text = new TextboxExt("LabelDesk", {
      ...OBJECT_DEFAULTS_TEXT,
      left: labelProps.size.width / 2,
      top: labelProps.size.height / 2,
      fontSize: 32,
    });
    canvas.add(text);
    canvas.virtualZoom(2);
    canvas.renderAll();

    // Baseline snapshot (index 0) so the first edit is undoable back to the empty label.
    commit();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__canvas = canvas;
    }

    return () => canvas?.dispose();
  });

  const zoomIn = () => canvas?.virtualZoomIn();
  const zoomOut = () => canvas?.virtualZoomOut();
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} />

<div class="app">
  <header class="topbar">
    <div class="logo">LabelDesk<i></i></div>
    <button class="menu-btn" onclick={() => (libraryOpen = true)}>Library</button>
    <div class="undo-cluster">
      <button class="icon-btn" title="Undo (Ctrl+Z)" disabled={undoDisabled} onclick={undo} aria-label="Undo">
        ↺
      </button>
      <button class="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={redoDisabled} onclick={redo} aria-label="Redo">
        ↻
      </button>
    </div>
    <div class="doc-chip">
      Untitled · {(labelProps.size.width / DPMM).toFixed(1)} × {(labelProps.size.height / DPMM).toFixed(1)} mm · 203 dpi
    </div>
    <button
      class="chip"
      class:connected={$connectionState === "connected"}
      class:connecting={$connectionState === "connecting"}
      onclick={onConnectClick}
    >
      <span class="dot"></span>
      {#if $connectionState === "connected"}
        {$printerName}
        {#if $heartbeat?.chargeLevel != null}
          <span class="batt">{$heartbeat.chargeLevel * 25}%</span>
        {/if}
      {:else if $connectionState === "connecting"}
        Connecting…
      {:else}
        Connect printer
      {/if}
    </button>
    <button class="btn-print" onclick={() => (printDialogOpen = true)}>Print</button>
  </header>

  <PrintDialog bind:open={printDialogOpen} {getCanvasJson} {labelProps} dpmm={DPMM} />
  <LibraryDialog
    bind:open={libraryOpen}
    onSave={saveLabelToLibrary}
    onLoad={loadTemplate}
    onExport={exportLabelJson}
    onImport={importLabelJson}
  />

  <div class="main">
    <ToolRail onAdd={addObject} />

    <main class="canvas-area">
      <div class="canvas-holder">
        <canvas bind:this={canvasEl}></canvas>
      </div>
      <div class="zoom-cluster">
        <button onclick={zoomOut}>−</button>
        <span class="z">{zoomPercent}%</span>
        <button onclick={zoomIn}>+</button>
      </div>
    </main>

    <PropsPanel
      {selection}
      {rev}
      {labelProps}
      dpmm={DPMM}
      onChanged={onPropChanged}
      onDelete={deleteSelection}
      onLabelSize={applyLabelSize}
      onLabelProps={updateLabelProps}
    />
  </div>

  <footer class="status">
    <span>GRID 5 PX · SNAP ON</span>
    <span class="right">NO PRINTER · 203 DPI</span>
  </footer>
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    height: 52px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    background: var(--paper);
    border-bottom: 1.5px solid var(--ink);
  }

  .logo {
    font-family: var(--font-display);
    font-size: 17px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    display: flex;
    align-items: center;
  }

  .logo i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--red);
    display: inline-block;
    margin-left: 4px;
  }

  .menu-btn {
    border: 0;
    background: transparent;
    font-family: var(--font-ui);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink-2);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
  }

  .menu-btn:hover {
    background: var(--paper-2);
    color: var(--ink);
  }

  .undo-cluster {
    display: flex;
    gap: 2px;
  }

  .icon-btn {
    border: 1px solid var(--line-2);
    background: var(--raised);
    color: var(--ink-2);
    width: 30px;
    height: 28px;
    border-radius: var(--r-s);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--paper-2);
    color: var(--ink);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .doc-chip {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--ink-2);
    border: 1px solid var(--line-2);
    border-radius: var(--r-s);
    padding: 6px 12px;
    background: var(--raised);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border: 1.5px solid var(--line-2);
    border-radius: 20px;
    background: var(--raised);
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-ui);
    color: var(--ink);
    cursor: pointer;
  }

  .chip .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink-3);
  }

  .chip.connecting .dot {
    background: var(--blue);
    animation: pulse 1s infinite;
  }

  .chip.connected {
    border-color: var(--green);
  }

  .chip.connected .dot {
    background: var(--green);
    box-shadow: 0 0 0 3px rgba(46, 125, 79, 0.18);
  }

  .chip .batt {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--ink-3);
    border-left: 1px solid var(--line);
    padding-left: 8px;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }


  .btn-print {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 9px 20px;
    border-radius: var(--r-s);
    cursor: pointer;
    border: 1.5px solid var(--red-2);
    background: var(--red);
    color: #fff8f0;
    box-shadow: var(--shadow);
  }

  .btn-print:disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  .main {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .canvas-area {
    flex: 1;
    min-width: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--paper-2);
    background-image: radial-gradient(circle, #cbc4b2 1px, transparent 1.2px);
    background-size: 18px 18px;
  }

  .canvas-holder {
    box-shadow: var(--shadow-lg);
  }

  .zoom-cluster {
    position: absolute;
    left: 16px;
    bottom: 16px;
    display: flex;
    background: var(--raised);
    border: 1.5px solid var(--ink);
    border-radius: 5px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .zoom-cluster button {
    border: 0;
    background: transparent;
    width: 34px;
    height: 32px;
    cursor: pointer;
    color: var(--ink-2);
    font-size: 15px;
    border-right: 1px solid var(--line);
  }

  .zoom-cluster button:last-child {
    border-right: 0;
    border-left: 1px solid var(--line);
  }

  .zoom-cluster button:hover {
    background: var(--paper-2);
    color: var(--ink);
  }

  .zoom-cluster .z {
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 500;
    width: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status {
    height: 26px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 0 14px;
    background: var(--paper);
    border-top: 1px solid var(--line-2);
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--ink-3);
  }

  .status .right {
    margin-left: auto;
  }
</style>
