<script lang="ts">
  import { cancelPrint, connectionState, printError, printProgress, printState } from "$/printer";

  interface Props {
    /** batch printing needs row validation and scope, so it goes through the dialog */
    batchEnabled: boolean;
    onQuickPrint: () => Promise<void>;
    onOpenPrintDialog: () => void;
  }

  let { batchEnabled, onQuickPrint, onOpenPrintDialog }: Props = $props();

  let started = $state(false);

  const connected = $derived($connectionState === "connected");
  const busy = $derived($printState !== "idle");

  const onClick = async () => {
    if (batchEnabled) {
      onOpenPrintDialog();
      return;
    }
    started = true;
    try {
      await onQuickPrint();
    } catch (error) {
      console.error("Quick print failed:", error);
    }
  };
</script>

<div class="row">
  <button class="quick" onclick={onClick} disabled={busy || (!batchEnabled && !connected)}
    title={batchEnabled ? "Batch data is enabled - open the print dialog" : "Print one label with default settings"}>
    {#if $printState === "sending"}
      Sending...
    {:else if $printState === "printing"}
      Printing {$printProgress}%
    {:else if batchEnabled}
      Print batch...
    {:else if !connected}
      Quick Print - no printer
    {:else}
      Quick Print
    {/if}
  </button>
  {#if busy && started}
    <button class="cancel" onclick={cancelPrint}>Cancel</button>
  {/if}
</div>
{#if started && !busy && $printError}
  <div class="error">{$printError}</div>
{/if}

<style>
  .row {
    display: flex;
    gap: 6px;
  }

  .quick {
    flex: 1;
    padding: 8px 0;
    color: #fff8f0;
    background: var(--red);
    border: 1.5px solid var(--red-2);
    border-radius: 4px;
    box-shadow: var(--shadow);
    font-family: var(--font-ui);
    font-size: 12.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    cursor: pointer;
  }

  .quick:active { transform: translate(2px, 2px); box-shadow: none; }
  .quick:disabled { opacity: 0.5; cursor: default; transform: none; }

  .cancel {
    padding: 8px 12px;
    color: var(--ink-2);
    background: var(--raised);
    border: 1.5px solid var(--line-2);
    border-radius: 4px;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .error {
    margin-top: 8px;
    padding: 8px 10px;
    color: #fff8f0;
    background: var(--red);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 10.5px;
  }
</style>
