<script lang="ts">
  import {
    printLabel,
    printBatch,
    renderPrintCanvas,
    connectionState,
    printerMeta,
    printerName,
    printState,
    printProgress,
    printCurrentRow,
    printError,
  } from "$/printer";
  import type { BatchParseResult, FabricJson, LabelProps, PostProcessType } from "$/types";
  import {
    buildBatchPrintRows,
    parseBatchCsv,
    totalBatchLabels,
    validateBatchForCanvas,
  } from "$/utils/batch_data";

  interface Props {
    open: boolean;
    getCanvasJson: () => FabricJson;
    labelProps: LabelProps;
    dpmm: number;
    batchEnabled: boolean;
    csvText: string;
    missingFontFamilies: string[];
  }

  let { open = $bindable(), getCanvasJson, labelProps, dpmm, batchEnabled, csvText, missingFontFamilies }: Props = $props();

  let copies = $state(1);
  let density = $state(3);
  let postProcess = $state<PostProcessType>("threshold");
  let thresholdValue = $state(140);
  let previewEl: HTMLCanvasElement | undefined = $state();
  let parsed = $state<BatchParseResult>({ columns: [], rows: [], errors: [], valid: false });
  let previewIndex = $state(0);
  let printScope = $state<"all" | "range">("all");
  let rangeStart = $state(1);
  let rangeEnd = $state(1);
  let previewRequest = 0;

  const densities = [1, 2, 3, 4, 5];
  const postProcessNames: Record<PostProcessType, string> = {
    threshold: "Threshold",
    dither: "Atkinson",
    bayer: "Bayer",
  };

  $effect(() => {
    if (!open) return;
    const source = csvText;
    const enabled = batchEnabled;
    const nextParsed = enabled
      ? validateBatchForCanvas(parseBatchCsv(source), getCanvasJson())
      : { columns: [], rows: [], errors: [], valid: true };
    parsed = nextParsed;

    const lastRow = Math.max(1, nextParsed.rows.length);
    previewIndex = 0;
    rangeStart = 1;
    rangeEnd = lastRow;
  });

  $effect(() => {
    if (!open || !previewEl) return;
    void postProcess;
    void thresholdValue;
    void previewIndex;
    void parsed;
    void batchEnabled;
    void renderPreview();
  });

  $effect(() => {
    if (open) density = $printerMeta?.densityDefault ?? 3;
  });

  const renderPreview = async () => {
    if (!previewEl) return;
    const request = ++previewRequest;
    const variables = batchEnabled ? parsed.rows[previewIndex]?.values ?? {} : {};
    const rendered = await renderPrintCanvas(getCanvasJson(), labelProps, {
      postProcess,
      threshold: thresholdValue,
      variables,
    });
    if (request !== previewRequest || !previewEl) return;
    previewEl.width = rendered.width;
    previewEl.height = rendered.height;
    previewEl.getContext("2d")!.drawImage(rendered, 0, 0);
  };

  const getPrintRows = () => {
    const start = printScope === "all" ? 1 : rangeStart;
    const end = printScope === "all" ? parsed.rows.length : rangeEnd;
    return buildBatchPrintRows(parsed, start, end, copies);
  };

  const labelCount = () => batchEnabled ? totalBatchLabels(getPrintRows()) : copies;
  const batchBlocked = () => batchEnabled && (!parsed.valid || labelCount() === 0);
  const rangeInvalid = () => printScope === "range" && (
    !Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) ||
    rangeStart < 1 || rangeEnd < rangeStart || rangeEnd > parsed.rows.length
  );

  const close = () => {
    if ($printState !== "idle") return;
    previewRequest++;
    open = false;
  };

  const onPrint = async () => {
    try {
      const options = { density, postProcess, threshold: thresholdValue };
      if (batchEnabled) {
        await printBatch(getCanvasJson(), labelProps, getPrintRows(), options);
      } else {
        await printLabel(getCanvasJson(), labelProps, { ...options, quantity: copies });
      }
      if (!$printError) open = false;
    } catch (error) {
      console.error("Print failed:", error);
    }
  };

  const previousRow = () => (previewIndex = Math.max(0, previewIndex - 1));
  const nextRow = () => (previewIndex = Math.min(parsed.rows.length - 1, previewIndex + 1));

  const onKeydown = (event: KeyboardEvent) => {
    if (open && event.key === "Escape") close();
  };

  const mm = (px: number) => Math.round((px / dpmm) * 10) / 10;
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="backdrop" onclick={(event) => event.target === event.currentTarget && close()} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Print">
      <div class="dlg-head">
        <b>Print</b>
        <button class="x" onclick={close}>ESC</button>
      </div>

      <div class="dlg-body">
        <div class="preview-strip" data-caption={`1-BIT PREVIEW - ${postProcessNames[postProcess].toUpperCase()}`}>
          <canvas bind:this={previewEl} class="label-prev"></canvas>
        </div>

        {#if batchEnabled}
          <div class="row-nav">
            <button onclick={previousRow} disabled={previewIndex <= 0 || $printState !== "idle"} aria-label="Previous row">&lt;</button>
            <span>ROW {parsed.rows[previewIndex]?.sourceRow ?? 0} OF {parsed.rows.length}</span>
            <button onclick={nextRow} disabled={previewIndex >= parsed.rows.length - 1 || $printState !== "idle"} aria-label="Next row">&gt;</button>
          </div>
        {/if}

        <div class="opts">
          <div class="field">
            <span class="lbl">Copies</span>
            <div class="stepper">
              <button onclick={() => (copies = Math.max(1, copies - 1))}>-</button>
              <span>{copies}</span>
              <button onclick={() => (copies = Math.min(99, copies + 1))}>+</button>
            </div>
          </div>

          <div class="field">
            <span class="lbl">Density</span>
            <div class="seg">
              {#each densities as value (value)}
                <button class:on={density === value} onclick={() => (density = value)}>{value}</button>
              {/each}
            </div>
          </div>

          <div class="field wide">
            <span class="lbl">Dithering</span>
            <div class="seg">
              {#each Object.entries(postProcessNames) as [value, name] (value)}
                <button class:on={postProcess === value} onclick={() => (postProcess = value as PostProcessType)}>{name}</button>
              {/each}
            </div>
          </div>

          <div class="field wide">
            <span class="lbl">Threshold <em>{thresholdValue}</em></span>
            <input type="range" min="1" max="254" bind:value={thresholdValue} />
          </div>

          {#if batchEnabled}
            <div class="field wide">
              <span class="lbl">Batch scope</span>
              <div class="seg">
                <button class:on={printScope === "all"} onclick={() => (printScope = "all")}>All rows</button>
                <button class:on={printScope === "range"} onclick={() => (printScope = "range")}>Row range</button>
              </div>
            </div>

            {#if printScope === "range"}
              <div class="field wide range-fields">
                <label>From row <input type="number" min="1" max={parsed.rows.length} bind:value={rangeStart} /></label>
                <label>To row <input type="number" min={rangeStart} max={parsed.rows.length} bind:value={rangeEnd} /></label>
              </div>
            {/if}
          {/if}
        </div>

        {#if batchEnabled && parsed.errors.length > 0}
          <div class="validation">
            {#each parsed.errors as error}<span>{error}</span>{/each}
          </div>
        {:else if batchEnabled && rangeInvalid()}
          <div class="validation"><span>Choose a valid inclusive row range.</span></div>
        {:else if batchEnabled && labelCount() === 0}
          <div class="validation"><span>The selected rows produce no labels because $times is zero.</span></div>
        {/if}

        {#if missingFontFamilies.length > 0}
          <div class="font-warning">
            Missing {missingFontFamilies.length === 1 ? "font" : "fonts"}: {missingFontFamilies.join(", ")}. Preview and printing use fallback fonts.
          </div>
        {/if}

        {#if $printError}<div class="error">{$printError}</div>{/if}
      </div>

      <div class="dlg-foot">
        <span class="eta">
          {#if $printState === "printing" && batchEnabled}
            row {$printCurrentRow} - {$printProgress}%
          {:else}
            {$printerName || "printer"} - {mm(labelProps.size.width)} x {mm(labelProps.size.height)} mm
            <b>· {labelCount()} {labelCount() === 1 ? "label" : "labels"}</b>
          {/if}
        </span>
        <div class="foot-btns">
          <button class="btn ghost" onclick={close} disabled={$printState !== "idle"}>Cancel</button>
          <button class="btn primary" onclick={onPrint} disabled={$printState !== "idle" || $connectionState !== "connected" || batchBlocked()}>
            {#if $printState === "sending"}
              Sending...
            {:else if $printState === "printing"}
              Printing {$printProgress}%
            {:else if $connectionState !== "connected"}
              No printer
            {:else}
              Print {labelCount()} {labelCount() === 1 ? "label" : "labels"}
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
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(26, 22, 17, 0.35);
  }

  .dialog {
    width: min(460px, calc(100vw - 24px));
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--raised);
    border: 1.5px solid var(--ink);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
  }

  .dlg-head,
  .dlg-foot {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    background: var(--paper);
  }

  .dlg-head { border-bottom: 1.5px solid var(--ink); }
  .dlg-foot { gap: 10px; border-top: 1px solid var(--line); }

  .dlg-head b {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .x {
    padding: 2px 6px;
    color: var(--ink-3);
    background: none;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
  }

  .dlg-body { padding: 18px; overflow-y: auto; }

  .preview-strip {
    position: relative;
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
    padding: 16px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 6px;
  }

  .preview-strip::after {
    content: attr(data-caption);
    position: absolute;
    right: 8px;
    bottom: 6px;
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.5px;
  }

  .label-prev {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 140px;
    background: #fff;
    border: 1px solid var(--line-2);
    border-radius: 4px;
    box-shadow: var(--shadow);
    image-rendering: pixelated;
  }

  .row-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: -7px 0 13px;
  }

  .row-nav span {
    min-width: 110px;
    text-align: center;
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 600;
  }

  .row-nav button {
    width: 28px;
    height: 24px;
    color: var(--ink-2);
    background: var(--raised);
    border: 1px solid var(--line-2);
    border-radius: 3px;
    cursor: pointer;
  }

  .row-nav button:disabled { opacity: 0.35; cursor: default; }

  .opts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 16px;
  }

  .field.wide { grid-column: 1 / -1; }

  .lbl {
    display: block;
    margin-bottom: 5px;
    color: var(--ink-2);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .lbl em {
    float: right;
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-style: normal;
  }

  .stepper,
  .seg {
    display: flex;
    overflow: hidden;
    background: var(--paper);
    border: 1.5px solid var(--ink);
    border-radius: 4px;
  }

  .stepper button {
    width: 30px;
    height: 30px;
    color: var(--ink-2);
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .stepper span {
    flex: 1;
    align-self: center;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .seg button {
    flex: 1;
    padding: 7px 0;
    color: var(--ink-2);
    background: var(--raised);
    border: 0;
    border-right: 1px solid var(--line);
    font-family: var(--font-ui);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .seg button:last-child { border-right: 0; }
  .seg button.on { color: var(--paper); background: var(--ink); }

  input[type="range"] { width: 100%; accent-color: var(--ink); }

  .range-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .range-fields label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-2);
    font-size: 11px;
    font-weight: 600;
  }

  .range-fields input {
    width: 62px;
    padding: 5px 6px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--line-2);
    border-radius: 3px;
    font-family: var(--font-mono);
  }

  .validation,
  .error {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 12px;
    padding: 8px 10px;
    color: #fff8f0;
    background: var(--red);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 10.5px;
  }

  .font-warning {
    margin-top: 12px;
    padding: 8px 10px;
    color: var(--amber);
    background: rgba(199, 125, 10, 0.08);
    border: 1px solid var(--amber);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 1.4;
  }

  .eta {
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .foot-btns { display: flex; gap: 10px; }

  .btn {
    padding: 9px 18px;
    border: 1.5px solid var(--ink);
    border-radius: 4px;
    box-shadow: var(--shadow);
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn.primary {
    color: #fff8f0;
    background: var(--red);
    border-color: var(--red-2);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .btn.ghost {
    color: var(--ink-2);
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }

  .eta b {
    color: var(--ink);
    font-weight: 700;
  }

  .btn:disabled { opacity: 0.5; pointer-events: none; }
  .btn.primary:active { transform: translate(2px, 2px); box-shadow: none; }
</style>
