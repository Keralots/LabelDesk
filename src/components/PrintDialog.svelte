<script lang="ts">
  import {
    printLabel,
    renderPrintCanvas,
    connectionState,
    printerMeta,
    printerName,
    printState,
    printProgress,
    printError,
  } from "$/printer";
  import type { FabricJson, LabelProps, PostProcessType } from "$/types";

  interface Props {
    open: boolean;
    getCanvasJson: () => FabricJson;
    labelProps: LabelProps;
    dpmm: number;
  }

  let { open = $bindable(), getCanvasJson, labelProps, dpmm }: Props = $props();

  let copies = $state(1);
  let density = $state(3);
  let postProcess = $state<PostProcessType>("threshold");
  let thresholdValue = $state(140);
  let previewEl: HTMLCanvasElement | undefined = $state();

  const densities = [1, 2, 3, 4, 5];
  const postProcessNames: Record<PostProcessType, string> = {
    threshold: "Threshold",
    dither: "Atkinson",
    bayer: "Bayer",
  };

  $effect(() => {
    if (!open || !previewEl) return;
    // touch reactive deps so the preview follows the options
    void postProcess;
    void thresholdValue;
    renderPreview();
  });

  $effect(() => {
    if (open) {
      density = $printerMeta?.densityDefault ?? 3;
    }
  });

  const renderPreview = async () => {
    if (!previewEl) return;
    const rendered = await renderPrintCanvas(getCanvasJson(), labelProps, {
      postProcess,
      threshold: thresholdValue,
    });
    previewEl.width = rendered.width;
    previewEl.height = rendered.height;
    previewEl.getContext("2d")!.drawImage(rendered, 0, 0);
  };

  const close = () => {
    if ($printState !== "idle") return;
    open = false;
  };

  const onPrint = async () => {
    try {
      await printLabel(getCanvasJson(), labelProps, {
        quantity: copies,
        density,
        postProcess,
        threshold: thresholdValue,
      });
      if (!$printError) {
        open = false;
      }
    } catch (e) {
      console.error("Print failed:", e);
    }
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (open && e.key === "Escape") close();
  };

  const mm = (px: number) => Math.round((px / dpmm) * 10) / 10;
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && close()} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Print">
      <div class="dlg-head">
        <b>Print</b>
        <button class="x" onclick={close}>ESC</button>
      </div>

      <div class="dlg-body">
        <div class="preview-strip" data-caption="1-BIT PREVIEW · {postProcessNames[postProcess].toUpperCase()}">
          <canvas bind:this={previewEl} class="label-prev"></canvas>
        </div>

        <div class="opts">
          <div class="field">
            <span class="lbl">Copies</span>
            <div class="stepper">
              <button onclick={() => (copies = Math.max(1, copies - 1))}>−</button>
              <span>{copies}</span>
              <button onclick={() => (copies = Math.min(99, copies + 1))}>+</button>
            </div>
          </div>

          <div class="field">
            <span class="lbl">Density</span>
            <div class="seg">
              {#each densities as d (d)}
                <button class:on={density === d} onclick={() => (density = d)}>{d}</button>
              {/each}
            </div>
          </div>

          <div class="field wide">
            <span class="lbl">Dithering</span>
            <div class="seg">
              {#each Object.entries(postProcessNames) as [value, name] (value)}
                <button class:on={postProcess === value} onclick={() => (postProcess = value as PostProcessType)}>
                  {name}
                </button>
              {/each}
            </div>
          </div>

          <div class="field wide">
            <span class="lbl">Threshold <em>{thresholdValue}</em></span>
            <input type="range" min="1" max="254" bind:value={thresholdValue} />
          </div>
        </div>

        {#if $printError}
          <div class="error">{$printError}</div>
        {/if}
      </div>

      <div class="dlg-foot">
        <span class="eta">{$printerName || "printer"} · {mm(labelProps.size.width)} × {mm(labelProps.size.height)} mm</span>
        <div class="foot-btns">
          <button class="btn ghost" onclick={close} disabled={$printState !== "idle"}>Cancel</button>
          <button class="btn primary" onclick={onPrint} disabled={$printState !== "idle" || $connectionState !== "connected"}>
            {#if $printState === "sending"}
              Sending…
            {:else if $printState === "printing"}
              Printing {$printProgress}%
            {:else if $connectionState !== "connected"}
              No printer
            {:else}
              Print {copies} {copies === 1 ? "label" : "labels"}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(26, 22, 17, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }

  .dialog {
    width: 440px;
    background: var(--raised);
    border: 1.5px solid var(--ink);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  .dlg-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1.5px solid var(--ink);
    background: var(--paper);
  }

  .dlg-head b {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .dlg-head .x {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-3);
    background: none;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    padding: 2px 6px;
    cursor: pointer;
  }

  .dlg-body {
    padding: 18px;
  }

  .preview-strip {
    position: relative;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 16px;
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  .preview-strip::after {
    content: attr(data-caption);
    position: absolute;
    right: 8px;
    bottom: 6px;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.5px;
    color: var(--ink-3);
  }

  .label-prev {
    max-width: 100%;
    max-height: 140px;
    background: #fff;
    border: 1px solid var(--line-2);
    border-radius: 4px;
    box-shadow: var(--shadow);
    image-rendering: pixelated;
    width: auto;
    height: auto;
  }

  .opts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 16px;
  }

  .field.wide {
    grid-column: 1 / -1;
  }

  .lbl {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--ink-2);
    margin-bottom: 5px;
  }

  .lbl em {
    font-style: normal;
    font-family: var(--font-mono);
    color: var(--ink-3);
    float: right;
  }

  .stepper {
    display: flex;
    align-items: center;
    border: 1.5px solid var(--line-2);
    border-radius: 4px;
    background: var(--paper);
    overflow: hidden;
  }

  .stepper button {
    width: 30px;
    height: 30px;
    border: 0;
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 14px;
  }

  .stepper button:hover {
    background: var(--paper-2);
  }

  .stepper span {
    flex: 1;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
  }

  .seg {
    display: flex;
    border: 1.5px solid var(--ink);
    border-radius: 4px;
    overflow: hidden;
  }

  .seg button {
    flex: 1;
    border: 0;
    background: var(--raised);
    padding: 7px 0;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
    border-right: 1px solid var(--line);
    font-family: var(--font-ui);
  }

  .seg button:last-child {
    border-right: 0;
  }

  .seg button.on {
    background: var(--ink);
    color: var(--paper);
  }

  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 3px;
    background: var(--line-2);
    border-radius: 2px;
    outline: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--raised);
    border: 2px solid var(--ink);
    cursor: pointer;
    box-shadow: var(--shadow);
  }

  .error {
    margin-top: 12px;
    padding: 8px 10px;
    background: var(--red);
    color: #fff8f0;
    font-family: var(--font-mono);
    font-size: 11px;
    border-radius: 4px;
  }

  .dlg-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-top: 1px solid var(--line);
    background: var(--paper);
  }

  .eta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-3);
  }

  .foot-btns {
    display: flex;
    gap: 10px;
  }

  .btn {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 600;
    padding: 9px 18px;
    border-radius: 4px;
    cursor: pointer;
    border: 1.5px solid var(--ink);
    box-shadow: var(--shadow);
  }

  .btn.primary {
    background: var(--red);
    border-color: var(--red-2);
    color: #fff8f0;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .btn.primary:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 rgba(26, 22, 17, 0.16);
  }

  .btn.ghost {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: var(--ink-2);
  }

  .btn:disabled {
    opacity: 0.5;
    pointer-events: none;
  }
</style>
