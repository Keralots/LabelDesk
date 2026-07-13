<script lang="ts">
  import dayjs from "dayjs";
  import type { ExportedLabelTemplate } from "$/types";
  import { LocalStoragePersistence } from "$/utils/persistence";

  interface Props {
    open: boolean;
    onSave: (title: string) => void;
    onLoad: (template: ExportedLabelTemplate) => void;
  }

  let { open = $bindable(), onSave, onLoad }: Props = $props();

  let labels = $state<ExportedLabelTemplate[]>([]);
  let title = $state("");
  let error = $state("");

  $effect(() => {
    if (open) refresh();
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
      onSave(title.trim());
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

  const load = (tpl: ExportedLabelTemplate) => {
    onLoad(tpl);
    open = false;
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
    width: 560px;
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
