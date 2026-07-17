<script lang="ts">
  import { csvData } from "$/stores";
  import { FileUtils } from "$/utils/file_utils";
  import { parseBatchCsv, validateBatchForCanvas } from "$/utils/batch_data";
  import type { BatchParseResult, FabricJson } from "$/types";
  import { MAX_CSV_TEXT_CHARS } from "$/utils/import_safety";

  interface Props {
    open: boolean;
    enabled: boolean;
    revision: number;
    getCanvasJson: () => FabricJson;
    onAddPlaceholder: (column: string) => void;
    onChanged: () => void;
  }

  let {
    open = $bindable(),
    enabled = $bindable(),
    revision,
    getCanvasJson,
    onAddPlaceholder,
    onChanged,
  }: Props = $props();

  let parsed = $state<BatchParseResult>({ columns: [], rows: [], errors: [], valid: false });
  let importError = $state("");

  $effect(() => {
    const source = $csvData.data;
    void revision;
    const csvResult = parseBatchCsv(source);
    parsed = open ? validateBatchForCanvas(csvResult, getCanvasJson()) : csvResult;
  });

  const importCsv = async () => {
    importError = "";
    try {
      const data = await FileUtils.pickAndReadSingleTextFile("csv");
      $csvData = { data };
      enabled = true;
      onChanged();
    } catch (error) {
      importError = `${error}`;
    }
  };

  const close = () => (open = false);

  const onKeydown = (event: KeyboardEvent) => {
    if (open && event.key === "Escape") close();
  };
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="backdrop" onclick={(event) => event.target === event.currentTarget && close()} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Batch data">
      <div class="dlg-head">
        <div>
          <b>Batch data</b>
          <span>{parsed.rows.length} {parsed.rows.length === 1 ? "row" : "rows"}</span>
        </div>
        <button class="x" onclick={close}>ESC</button>
      </div>

      <div class="toolbar">
        <label class="enable">
          <input
            type="checkbox"
            checked={enabled}
            onchange={(event) => {
              enabled = event.currentTarget.checked;
              onChanged();
            }}
          />
          <span>Use CSV for preview and printing</span>
        </label>
        <button class="btn import" onclick={importCsv}>Import CSV</button>
      </div>

      <div class="body">
        <label for="csv-editor">CSV source</label>
        <textarea
          id="csv-editor"
          value={$csvData.data}
          maxlength={MAX_CSV_TEXT_CHARS}
          spellcheck="false"
          oninput={(event) => {
            if (event.currentTarget.value.length > MAX_CSV_TEXT_CHARS) {
              importError = "CSV data exceeds the 5 MB editor limit.";
              return;
            }
            importError = "";
            $csvData = { data: event.currentTarget.value };
            enabled = true;
            onChanged();
          }}
        ></textarea>

        <div class="section-title">Columns</div>
        <div class="columns">
          {#each parsed.columns as column, index (`${column}-${index}`)}
            {#if column}
              <button class:special={column === "$times"} onclick={() => onAddPlaceholder(column)} title="Add as text">
                {`{${column}}`}
              </button>
            {/if}
          {:else}
            <span class="muted">Add a header row to discover columns.</span>
          {/each}
        </div>
        <p class="hint">Click a column to add it as text. Use <code>$times</code> to set per-row quantities. Built-in date variables: <code>{"{dt}"}</code> and <code>{"{dt|YYYY-MM-DD}"}</code>.</p>

        {#if importError}
          <div class="errors"><b>Import failed</b><span>{importError}</span></div>
        {:else if parsed.errors.length > 0}
          <div class="errors">
            <b>Fix before printing</b>
            {#each parsed.errors as error}
              <span>{error}</span>
            {/each}
          </div>
        {:else}
          <div class="valid">CSV is valid and matches this label.</div>
        {/if}
      </div>

      <div class="dlg-foot">
        <span class:active={enabled}>{enabled ? "BATCH MODE ON" : "BATCH MODE OFF"}</span>
        <button class="btn done" onclick={close}>Done</button>
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
    width: min(580px, calc(100vw - 24px));
    max-height: 84vh;
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
  .dlg-foot { border-top: 1px solid var(--line); }

  .dlg-head > div {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .dlg-head b {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .dlg-head span,
  .dlg-foot span {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-3);
  }

  .dlg-foot span.active { color: var(--green); font-weight: 600; }

  .x {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-3);
    background: none;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    padding: 2px 6px;
    cursor: pointer;
  }

  .toolbar {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
  }

  .enable {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 600;
  }

  .body {
    overflow-y: auto;
    padding: 16px 18px 18px;
  }

  .body > label,
  .section-title {
    display: block;
    margin-bottom: 6px;
    color: var(--ink-2);
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 210px;
    resize: vertical;
    margin-bottom: 16px;
    padding: 10px;
    color: var(--ink);
    background: var(--paper);
    border: 1.5px solid var(--line-2);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.5;
  }

  textarea:focus { outline: none; border-color: var(--ink); }

  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .columns button {
    padding: 4px 7px;
    color: var(--blue);
    background: var(--raised);
    border: 1px solid var(--blue);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    cursor: pointer;
  }

  .columns button.special { color: var(--amber); border-color: var(--amber); }
  .columns button:hover { color: #fff; background: var(--blue); }
  .columns button.special:hover { background: var(--amber); }

  .hint,
  .muted {
    color: var(--ink-3);
    font-size: 11px;
    line-height: 1.45;
  }

  code { font-family: var(--font-mono); }

  .errors,
  .valid {
    margin-top: 12px;
    padding: 9px 10px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 10.5px;
  }

  .errors {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: #fff8f0;
    background: var(--red);
  }

  .valid {
    color: var(--green);
    background: rgba(46, 125, 79, 0.08);
    border: 1px solid rgba(46, 125, 79, 0.35);
  }

  .btn {
    padding: 8px 14px;
    color: var(--ink);
    background: var(--raised);
    border: 1.5px solid var(--ink);
    border-radius: 4px;
    box-shadow: var(--shadow);
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn:active { transform: translate(2px, 2px); box-shadow: none; }
</style>
