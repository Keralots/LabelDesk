<script lang="ts">
  interface Props { open: boolean; onClose: () => void }
  let { open, onClose }: Props = $props();
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={onClose}>
    <div class="dialog" role="dialog" tabindex="-1" aria-modal="true" aria-label="About LabelDesk" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
      <header><h2>About LabelDesk</h2><button onclick={onClose} aria-label="Close">×</button></header>
      <div class="body">
        <p>
          LabelDesk is a free, open-source label designer for NIIMBOT thermal
          printers. Design labels on the canvas, preview the exact one-bit
          output, and print directly over Web Bluetooth in a Chromium-based
          browser such as Chrome or Edge.
        </p>
        <p>
          Everything runs in your browser. There is no server behind this
          page: no accounts, no uploads, and no data collection. Labels,
          templates, and imported fonts stay on your device unless you export
          them yourself.
        </p>
        <p class="fine">
          LabelDesk is an independent project, not affiliated with or endorsed
          by NIIMBOT. Printer communication uses the MIT-licensed niimbluelib,
          and portions of the editor derive from niimblue.
        </p>
        <div class="links">
          <a href="https://github.com/Keralots/LabelDesk" target="_blank" rel="noopener noreferrer">Source code &amp; issues</a>
          <a href="https://ko-fi.com/keralots" target="_blank" rel="noopener noreferrer">Support the project on Ko-fi</a>
        </div>
        <div class="meta">{version ? `v${version} · ` : ""}MIT license</div>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(29, 27, 23, 0.38); }
  .dialog { width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; border: 1.5px solid var(--ink); border-radius: 8px; background: var(--raised); box-shadow: var(--shadow-lg); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1.5px solid var(--ink); background: var(--paper); }
  h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: .8px; }
  header button { border: 0; background: transparent; font-size: 22px; cursor: pointer; }
  .body { padding: 18px; font-size: 12.5px; line-height: 1.55; }
  p { margin: 0 0 12px; }
  .fine { color: var(--ink-3); font-size: 11px; }
  .links { display: flex; flex-direction: column; gap: 6px; margin: 14px 0; }
  .links a { color: var(--ink); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  .meta { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--ink-3); font: 9.5px var(--font-mono); text-transform: uppercase; letter-spacing: 1px; }
</style>
