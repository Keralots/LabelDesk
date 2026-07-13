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
  import {
    connect,
    disconnect,
    printLabel,
    connectionState,
    printerName,
    heartbeat,
    printState,
    printProgress,
    printError,
  } from "$/printer";
  import type { FabricJson } from "$/types";

  let canvasEl: HTMLCanvasElement;
  let canvas: CustomCanvas | undefined;
  let zoomPercent = $state(100);
  let selection = $state<fabric.FabricObject | null>(null);
  let rev = $state(0);

  const DPMM = 8; // 203 dpi

  const refreshCanvas = () => {
    canvas?.renderAll();
    rev++;
  };

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
        const maxW = DEFAULT_LABEL_PROPS.size.width * 0.8;
        const maxH = DEFAULT_LABEL_PROPS.size.height * 0.8;
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
  };

  const deleteSelection = () => {
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    canvas.discardActiveObject();
    active.forEach((o) => canvas?.remove(o));
    refreshCanvas();
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    const active = canvas?.getActiveObject();
    if (active instanceof fabric.IText && active.isEditing) return;
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

  const onPrintClick = async () => {
    if (!canvas) return;
    try {
      await printLabel(canvas.toJSON() as FabricJson, DEFAULT_LABEL_PROPS, { quantity: 1 });
    } catch (e) {
      console.error("Print failed:", e);
    }
  };

  onMount(() => {
    canvas = new CustomCanvas(canvasEl, {
      width: DEFAULT_LABEL_PROPS.size.width,
      height: DEFAULT_LABEL_PROPS.size.height,
    });
    canvas.setLabelProps(DEFAULT_LABEL_PROPS);
    canvas.onZoomChange = (zoom) => {
      zoomPercent = Math.round(zoom * 100);
    };

    canvas.on("selection:created", (e) => (selection = e.selected?.[0] ?? null));
    canvas.on("selection:updated", (e) => (selection = e.selected?.[0] ?? null));
    canvas.on("selection:cleared", () => (selection = null));
    canvas.on("object:modified", () => rev++);

    // OBJECT_DEFAULTS_TEXT uses center origin - left/top are the CENTER point
    const text = new TextboxExt("LabelDesk", {
      ...OBJECT_DEFAULTS_TEXT,
      left: DEFAULT_LABEL_PROPS.size.width / 2,
      top: DEFAULT_LABEL_PROPS.size.height / 2,
      fontSize: 32,
    });
    canvas.add(text);
    canvas.virtualZoom(2);
    canvas.renderAll();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__canvas = canvas;
    }

    return () => canvas?.dispose();
  });

  const zoomIn = () => canvas?.virtualZoomIn();
  const zoomOut = () => canvas?.virtualZoomOut();
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <header class="topbar">
    <div class="logo">LabelDesk<i></i></div>
    <div class="doc-chip">Untitled · 30.0 × 12.0 mm · 203 dpi</div>
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
    <button class="btn-print" disabled={$connectionState !== "connected" || $printState !== "idle"} onclick={onPrintClick}>
      {#if $printState === "sending"}
        Sending…
      {:else if $printState === "printing"}
        Printing {$printProgress}%
      {:else}
        Print
      {/if}
    </button>
  </header>

  {#if $printError}
    <div class="print-error">{$printError}</div>
  {/if}

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
      labelProps={DEFAULT_LABEL_PROPS}
      dpmm={DPMM}
      onChanged={refreshCanvas}
      onDelete={deleteSelection}
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

  .print-error {
    padding: 8px 16px;
    background: var(--red);
    color: #fff8f0;
    font-family: var(--font-mono);
    font-size: 11.5px;
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
