<script lang="ts">
  interface Props { open: boolean; onClose: () => void }
  let { open, onClose }: Props = $props();
  const sections = [
    ["Edit", [["Copy / cut / paste", "Ctrl+C / X / V"], ["Duplicate", "Ctrl+D"], ["Delete", "Del"], ["Select all", "Ctrl+A"], ["Undo / redo", "Ctrl+Z / Ctrl+Shift+Z"]]],
    ["Objects", [["Group / ungroup", "Ctrl+G / Ctrl+Shift+G"], ["Move 1 px", "Arrow keys"], ["Move 10 px", "Shift+Arrow"], ["Clear selection", "Esc"]]],
    ["View", [["Zoom", "Ctrl+wheel"], ["Pan", "Space+drag / middle-drag"], ["Zoom to fit", "Ctrl+0"], ["Actual size", "Ctrl+1"], ["Shortcut help", "?"]]],
  ] as const;
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={onClose}>
    <div class="dialog" role="dialog" tabindex="-1" aria-modal="true" aria-label="Keyboard shortcuts" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
      <header><h2>Keyboard shortcuts</h2><button onclick={onClose} aria-label="Close">×</button></header>
      <div class="body">
        {#each sections as [title, entries]}
          <div class="section">
            <h3>{title}</h3>
            {#each entries as [label, shortcut]}
              <div class="row"><span>{label}</span><kbd>{shortcut}</kbd></div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(29, 27, 23, 0.38); }
  .dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; border: 1.5px solid var(--ink); border-radius: 8px; background: var(--raised); box-shadow: var(--shadow-lg); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1.5px solid var(--ink); background: var(--paper); }
  h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: .8px; }
  header button { border: 0; background: transparent; font-size: 22px; cursor: pointer; }
  .body { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; padding: 18px; }
  h3 { margin: 0 0 8px; color: var(--ink-3); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  .row { display: flex; flex-direction: column; gap: 3px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 11.5px; }
  kbd { color: var(--ink-3); font: 9.5px var(--font-mono); }
  @media (max-width: 650px) { .body { grid-template-columns: 1fr; } }
</style>
