<script lang="ts">
  import { onMount } from "svelte";
  import { CustomCanvas } from "$/fabric-object/custom_canvas";
  import { TextboxExt } from "$/fabric-object/textbox-ext";
  import { DEFAULT_LABEL_PROPS, OBJECT_DEFAULTS_TEXT } from "$/defaults";

  let canvasEl: HTMLCanvasElement;
  let canvas: CustomCanvas | undefined;
  let zoomPercent = $state(100);

  onMount(() => {
    canvas = new CustomCanvas(canvasEl, {
      width: DEFAULT_LABEL_PROPS.size.width,
      height: DEFAULT_LABEL_PROPS.size.height,
    });
    canvas.setLabelProps(DEFAULT_LABEL_PROPS);
    canvas.onZoomChange = (zoom) => {
      zoomPercent = Math.round(zoom * 100);
    };

    const text = new TextboxExt("LabelDesk", {
      ...OBJECT_DEFAULTS_TEXT,
      left: 24,
      top: 28,
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

<div class="app">
  <header class="topbar">
    <div class="logo">LabelDesk<i></i></div>
    <div class="doc-chip">Untitled · 40.0 × 12.0 mm · 203 dpi</div>
    <span class="chip"><span class="dot"></span>No printer</span>
    <button class="btn-print" disabled>Print</button>
  </header>

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
  }

  .chip .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink-3);
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

  .canvas-area {
    flex: 1;
    min-height: 0;
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
