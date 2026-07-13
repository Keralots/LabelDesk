<script lang="ts">
  export type ToolKind = "text" | "barcode" | "qrcode" | "rect" | "circle" | "line" | "image";

  interface Props {
    onAdd: (kind: ToolKind) => void;
  }

  let { onAdd }: Props = $props();

  const tools: { kind: ToolKind; title: string; icon: string }[] = [
    { kind: "text", title: "Text", icon: "M5 5h14M12 5v14" },
    { kind: "barcode", title: "Barcode", icon: "M4 5v14M8 5v14M11 5v14M15 5v14M20 5v14M17.5 5v14" },
    {
      kind: "qrcode",
      title: "QR code",
      icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM19 19h1v1h-1z",
    },
    { kind: "rect", title: "Rectangle", icon: "M4 7h16v12H4z" },
    { kind: "circle", title: "Circle", icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" },
    { kind: "line", title: "Line", icon: "M4 19L20 5" },
    {
      kind: "image",
      title: "Image",
      icon: "M3 5h18v14H3zM8.5 10a1.5 1.5 0 1 0 0-.01M21 15l-5-5-9 9",
    },
  ];
</script>

<div class="rail">
  {#each tools as tool (tool.kind)}
    <button class="tool" title={tool.title} onclick={() => onAdd(tool.kind)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d={tool.icon} />
      </svg>
    </button>
  {/each}
</div>

<style>
  .rail {
    width: 52px;
    flex: none;
    background: var(--paper);
    border-right: 1.5px solid var(--ink);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    gap: 6px;
  }

  .tool {
    width: 36px;
    height: 36px;
    border: 1.5px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--ink-2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .tool:hover {
    background: var(--paper-2);
    border-color: var(--line-2);
  }

  .tool:active {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
</style>
