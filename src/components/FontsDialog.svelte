<script lang="ts">
  import { fontLoadErrors, userFonts } from "$/stores";
  import { FONT_FILE_ACCEPT, createUserFont, fontFamilyFromFilename } from "$/utils/font_utils";

  interface Props {
    open: boolean;
    usedFamilies: string[];
    missingFamilies: string[];
  }

  let { open = $bindable(), usedFamilies, missingFamilies }: Props = $props();
  let familyOverride = $state("");
  let error = $state("");
  let busy = $state(false);
  let fontInput = $state<HTMLInputElement>();

  const familyKey = (value: string) => value.trim().toLocaleLowerCase();
  const isUsed = (family: string) => usedFamilies.some((value) => familyKey(value) === familyKey(family));
  const storedKilobytes = (base64: string) => Math.max(1, Math.round((base64.length * 0.75) / 1024));

  const importFont = async (file: File) => {
    error = "";
    busy = true;
    try {
      const requestedFamily = familyOverride.trim() || fontFamilyFromFilename(file.name);
      if ($userFonts.some((font) => familyKey(font.family) === familyKey(requestedFamily))) {
        throw new Error(`${requestedFamily} is already installed.`);
      }
      const font = await createUserFont(file, familyOverride);
      userFonts.update((fonts) => [...fonts, font]);
      familyOverride = "";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : `${caught}`;
    } finally {
      busy = false;
    }
  };

  const removeFont = (family: string) => {
    error = "";
    try {
      userFonts.update((fonts) => fonts.filter((font) => font.family !== family));
    } catch (caught) {
      error = caught instanceof Error ? caught.message : `${caught}`;
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
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Custom fonts">
      <div class="dlg-head">
        <div>
          <b>Custom fonts</b>
          <span>{$userFonts.length} installed</span>
        </div>
        <button class="x" onclick={close}>ESC</button>
      </div>

      <div class="import-row">
        <div class="family-field">
          <label for="font-family-name">Family name override</label>
          <input id="font-family-name" type="text" placeholder="Use filename" bind:value={familyOverride} />
        </div>
        <input
          class="file-input"
          bind:this={fontInput}
          type="file"
          accept={FONT_FILE_ACCEPT}
          onchange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importFont(file);
            event.currentTarget.value = "";
          }}
        />
        <button class="btn" disabled={busy} onclick={() => fontInput?.click()}>{busy ? "Loading..." : "Import font"}</button>
      </div>

      <p class="hint">TTF, OTF, WOFF, and WOFF2 files are stored only in this browser. Use the Library option to embed fonts in portable label templates.</p>

      {#if error}
        <div class="error">{error}</div>
      {/if}
      {#if $fontLoadErrors.length > 0}
        <div class="error">Could not activate: {$fontLoadErrors.join(", ")}</div>
      {/if}
      {#if missingFamilies.length > 0}
        <div class="warning">
          <b>Missing in current label</b>
          <span>{missingFamilies.join(", ")}</span>
          <small>Fallback fonts are shown and would be used for printing.</small>
        </div>
      {/if}

      <div class="font-list">
        {#each $userFonts as font (font.family)}
          <div class="font-row">
            <div class="preview" style:font-family={font.family}>Aa 0123</div>
            <div class="details">
              <b>{font.family}</b>
              <span>{font.mimeType.replace("font/", "").toUpperCase()} · ~{storedKilobytes(font.gzippedDataB64)} KB</span>
              {#if isUsed(font.family)}<small>USED BY CURRENT LABEL</small>{/if}
            </div>
            <button class="remove" onclick={() => removeFont(font.family)} title={`Remove ${font.family}`}>Remove</button>
          </div>
        {:else}
          <div class="empty">No custom fonts installed.</div>
        {/each}
      </div>

      <div class="dlg-foot">
        <span>Fonts remain local unless explicitly embedded.</span>
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
    width: 560px;
    max-height: 82vh;
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
  .dlg-head > div { display: flex; align-items: baseline; gap: 10px; }
  .dlg-head b { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
  .dlg-head span,
  .dlg-foot span { color: var(--ink-3); font-family: var(--font-mono); font-size: 10px; }

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

  .import-row {
    flex: none;
    display: flex;
    align-items: end;
    gap: 10px;
    padding: 14px 18px 8px;
  }

  .family-field { flex: 1; }
  .family-field label {
    display: block;
    margin-bottom: 4px;
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: 9.5px;
    text-transform: uppercase;
  }

  .family-field input {
    box-sizing: border-box;
    width: 100%;
    padding: 8px 10px;
    color: var(--ink);
    background: var(--paper);
    border: 1.5px solid var(--line-2);
    border-radius: 4px;
    font-family: var(--font-ui);
    font-size: 12.5px;
  }

  .family-field input:focus { outline: none; border-color: var(--ink); }
  .file-input { display: none; }
  .hint { margin: 0; padding: 0 18px 12px; color: var(--ink-3); font-size: 10.5px; line-height: 1.45; }

  .font-list { overflow-y: auto; padding: 4px 18px 16px; }
  .font-row {
    display: grid;
    grid-template-columns: 112px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border: 1px solid var(--line);
    border-bottom: 0;
    background: var(--paper);
  }
  .font-row:first-child { border-radius: 5px 5px 0 0; }
  .font-row:last-child { border-bottom: 1px solid var(--line); border-radius: 0 0 5px 5px; }
  .preview { overflow: hidden; font-size: 24px; white-space: nowrap; }
  .details b { display: block; font-size: 12px; }
  .details span { display: block; color: var(--ink-3); font-family: var(--font-mono); font-size: 9px; }
  .details small { color: var(--green); font-family: var(--font-mono); font-size: 8px; font-weight: 600; }

  .warning,
  .error {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 18px 12px;
    padding: 9px 10px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .warning { color: var(--amber); border: 1px solid var(--amber); background: rgba(199, 125, 10, 0.08); }
  .warning small { color: var(--ink-3); }
  .error { color: #fff8f0; background: var(--red); }
  .empty { padding: 24px 0; color: var(--ink-3); text-align: center; font-size: 12px; }

  .btn,
  .remove {
    padding: 8px 14px;
    color: var(--ink);
    background: var(--raised);
    border: 1.5px solid var(--ink);
    border-radius: 4px;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:disabled { opacity: 0.45; cursor: wait; }
  .remove { padding: 6px 9px; color: var(--red-2); border-color: var(--red-2); font-size: 10.5px; }
</style>
