<script lang="ts">
  interface Props {
    open: boolean;
    x: number;
    y: number;
    hasSelection: boolean;
    canPaste: boolean;
    canGroup: boolean;
    canUngroup: boolean;
    onClose: () => void;
    onCopy: () => void;
    onCut: () => void;
    onPaste: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onGroup: () => void;
    onUngroup: () => void;
    onFront: () => void;
    onBack: () => void;
    onLock: () => void;
    onHide: () => void;
    onShortcuts: () => void;
  }
  let { open, x, y, hasSelection, canPaste, canGroup, canUngroup, onClose, onCopy, onCut, onPaste, onDuplicate, onDelete, onGroup, onUngroup, onFront, onBack, onLock, onHide, onShortcuts }: Props = $props();
  const act = (callback: () => void) => { callback(); onClose(); };
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={onClose} oncontextmenu={(event) => { event.preventDefault(); onClose(); }}>
    <div class="menu" role="menu" tabindex="-1" style={`left:${Math.max(4, Math.min(x, window.innerWidth - 215))}px;top:${Math.max(4, Math.min(y, window.innerHeight - 390))}px`} onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
      <button disabled={!hasSelection} onclick={() => act(onCopy)}>Copy <kbd>Ctrl+C</kbd></button>
      <button disabled={!hasSelection} onclick={() => act(onCut)}>Cut <kbd>Ctrl+X</kbd></button>
      <button disabled={!canPaste} onclick={() => act(onPaste)}>Paste <kbd>Ctrl+V</kbd></button>
      <button disabled={!hasSelection} onclick={() => act(onDuplicate)}>Duplicate <kbd>Ctrl+D</kbd></button>
      <hr />
      <button disabled={!canGroup} onclick={() => act(onGroup)}>Group <kbd>Ctrl+G</kbd></button>
      <button disabled={!canUngroup} onclick={() => act(onUngroup)}>Ungroup <kbd>Ctrl+Shift+G</kbd></button>
      <button disabled={!hasSelection} onclick={() => act(onFront)}>Bring to front</button>
      <button disabled={!hasSelection} onclick={() => act(onBack)}>Send to back</button>
      <hr />
      <button disabled={!hasSelection} onclick={() => act(onLock)}>Lock selection</button>
      <button disabled={!hasSelection} onclick={() => act(onHide)}>Hide selection</button>
      <button disabled={!hasSelection} class="danger" onclick={() => act(onDelete)}>Delete <kbd>Del</kbd></button>
      <hr />
      <button onclick={() => act(onShortcuts)}>Keyboard shortcuts <kbd>?</kbd></button>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 80; }
  .menu {
    position: fixed;
    width: 204px;
    padding: 6px;
    border: 1.5px solid var(--ink);
    border-radius: 6px;
    background: var(--raised);
    box-shadow: var(--shadow-lg);
  }
  button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    border: 0;
    border-radius: 3px;
    background: transparent;
    padding: 7px 8px;
    color: var(--ink-2);
    font: 12px var(--font-ui);
    cursor: pointer;
    text-align: left;
  }
  button:hover:not(:disabled) { color: var(--ink); background: var(--paper-2); }
  button:disabled { opacity: 0.35; cursor: default; }
  button.danger { color: var(--red-2); }
  hr { border: 0; border-top: 1px solid var(--line); margin: 5px 2px; }
  kbd { color: var(--ink-3); font: 9.5px var(--font-mono); }
</style>
