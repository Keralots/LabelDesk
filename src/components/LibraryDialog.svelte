<script lang="ts">
  import dayjs from "dayjs";
  import type { ExportedLabelTemplate } from "$/types";
  import { LocalStoragePersistence } from "$/utils/persistence";

  interface Props {
    open: boolean;
    batchAvailable: boolean;
    currentTitle: string;
    embeddableFontCount: number;
    onSave: (title: string, includeCsv: boolean, includeFonts: boolean) => void;
    onLoad: (template: ExportedLabelTemplate) => void | Promise<void>;
    onExport: (includeCsv: boolean, includeFonts: boolean) => void;
    onExportPng: () => void;
    onImport: () => void | Promise<void>;
  }

  let {
    open = $bindable(),
    batchAvailable,
    currentTitle,
    embeddableFontCount,
    onSave,
    onLoad,
    onExport,
    onExportPng,
    onImport,
  }: Props = $props();

  let labels = $state<ExportedLabelTemplate[]>([]);
  let title = $state("");
  let error = $state("");
  let includeCsv = $state(false);
  let includeFonts = $state(false);

  $effect(() => {
    if (open) {
      includeCsv = false;
      includeFonts = false;
      title = currentTitle === "Untitled" ? "" : currentTitle;
      refresh();
    }
  });

  const refresh = () => {
    error = "";
    try {
      labels = LocalStoragePersistence.loadLabels().sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    } catch (e) {
      error = `${e}`;
      labels = [];
    }
  };

  const save = () => {
    try {
      onSave(title.trim(), batchAvailable && includeCsv, embeddableFontCount > 0 && includeFonts);
      title = "";
      refresh();
    } catch (e) {
      error = `${e}`;
    }
  };

  const remove = (tpl: ExportedLabelTemplate) => {
    try {
      LocalStoragePersistence.saveLabels(labels.filter((l) => l.id !== tpl.id));
      refresh();
    } catch (e) {
      error = `${e}`;
    }
  };

  const load = async (tpl: ExportedLabelTemplate) => {
    error = "";
    try {
      await onLoad(tpl);
      open = false;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : `${caught}`;
    }
  };

  const importLabel = async () => {
    error = "";
    try {
      await onImport();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : `${caught}`;
    }
  };

  const close = () => (open = false);

  const onKeydown = (e: KeyboardEvent) => {
    if (open && e.key === "Escape") close();
  };
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && close()} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Label library">
      <div class="dlg-head">
        <b>Library</b>
        <button class="x" onclick={close}>ESC</button>
      </div>

      <div class="save-row">
        <input
          class="name"
          type="text"
          placeholder="Label name (optional)"
          bind:value={title}
          onkeydown={(e) => e.key === "Enter" && save()}
        />
        <button class="btn save" onclick={save}>Save current</button>
      </div>

      <label class="include" class:disabled={!batchAvailable}>
        <input type="checkbox" bind:checked={includeCsv} disabled={!batchAvailable} />
        Include batch data in saved and exported labels
      </label>
      {#if embeddableFontCount > 0}
        <label class="include">
          <input type="checkbox" bind:checked={includeFonts} />
          Include {embeddableFontCount} custom {embeddableFontCount === 1 ? "font" : "fonts"} in saved and exported labels
        </label>
      {:else}
        <div class="include disabled">No custom fonts are used by the current label</div>
      {/if}

      <div class="io-row">
        <button class="btn io" onclick={() => onExport(batchAvailable && includeCsv, embeddableFontCount > 0 && includeFonts)}>Export JSON</button>
        <button class="btn io" onclick={onExportPng}>Export PNG</button>
        <button class="btn io" onclick={importLabel}>Import JSON</button>
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <div class="grid">
        {#each labels as tpl (tpl.id ?? tpl.timestamp)}
          <div class="card">
            <button class="thumb" onclick={() => load(tpl)} title="Load this label">
              {#if tpl.thumbnailBase64}
                <img src={tpl.thumbnailBase64} alt={tpl.title ?? "label"} />
              {:else}
                <span class="nothumb">no preview</span>
              {/if}
            </button>
            <div class="meta">
              <div class="info">
                <b>{tpl.title || "Untitled"}</b>
                <span>{tpl.timestamp ? dayjs.unix(tpl.timestamp).format("YYYY-MM-DD HH:mm") : ""}</span>
                {#if tpl.csv}<span class="batch">BATCH DATA</span>{/if}
                {#if tpl.fonts?.length}<span class="fonts">{tpl.fonts.length} FONT{tpl.fonts.length === 1 ? "" : "S"}</span>{/if}
              </div>
              <button class="del" title="Delete" onclick={() => remove(tpl)}>×</button>
            </div>
          </div>
        {:else}
          <div class="empty">No saved labels yet. Design one and hit "Save current".</div>
        {/each}
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
    width: min(560px, calc(100vw - 24px));
    max-height: 80vh;
    display: flex;
    flex-direction: column;
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
    flex: none;
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

  .save-row {
    display: flex;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--line);
    flex: none;
  }

  .name {
    flex: 1;
    font-family: var(--font-ui);
    font-size: 13px;
    padding: 8px 10px;
    background: var(--paper);
    border: 1.5px solid var(--line-2);
    border-radius: 4px;
    color: var(--ink);
  }

  .name:focus {
    outline: none;
    border-color: var(--ink);
  }

  .btn.save {
    font-family: var(--font-ui);
    font-size: 12.5px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    border: 1.5px solid var(--ink);
    background: var(--raised);
    box-shadow: var(--shadow);
    color: var(--ink);
  }

  .btn.save:active {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  .io-row {
    display: flex;
    gap: 10px;
    padding: 0 18px 14px;
    border-bottom: 1px solid var(--line);
    flex: none;
  }

  .include {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 18px 12px;
    color: var(--ink-2);
    background: var(--raised);
    font-size: 11.5px;
    font-weight: 600;
  }

  .include.disabled { opacity: 0.45; }

  .btn.io {
    flex: 1;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 0;
    border-radius: 4px;
    cursor: pointer;
    border: 1.5px solid var(--line-2);
    background: var(--paper);
    color: var(--ink-2);
  }

  .btn.io:hover {
    border-color: var(--ink);
    color: var(--ink);
  }

  .error {
    margin: 10px 18px 0;
    padding: 8px 10px;
    background: var(--red);
    color: #fff8f0;
    font-family: var(--font-mono);
    font-size: 11px;
    border-radius: 4px;
    flex: none;
  }

  .grid {
    padding: 14px 18px 18px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    overflow-y: auto;
  }

  .card {
    border: 1.5px solid var(--line-2);
    border-radius: 6px;
    background: var(--paper);
    overflow: hidden;
  }

  .thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 72px;
    background: #fff;
    border: 0;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    padding: 4px;
  }

  .thumb img {
    max-width: 100%;
    max-height: 100%;
  }

  .thumb:hover {
    outline: 2px solid var(--red);
    outline-offset: -2px;
  }

  .nothumb {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-3);
  }

  .meta {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    gap: 6px;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .info b {
    display: block;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .info span {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--ink-3);
  }

  .info span.batch {
    margin-left: 5px;
    color: var(--amber);
    font-size: 8px;
    font-weight: 600;
  }

  .info span.fonts {
    margin-left: 5px;
    color: var(--blue);
    font-size: 8px;
    font-weight: 600;
  }

  .del {
    border: 0;
    background: none;
    color: var(--ink-3);
    font-size: 15px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .del:hover {
    color: var(--red-2);
  }

  .empty {
    grid-column: 1 / -1;
    font-size: 12.5px;
    color: var(--ink-3);
    text-align: center;
    padding: 24px 0;
  }
</style>
