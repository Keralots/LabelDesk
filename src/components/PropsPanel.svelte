<script lang="ts">
  import * as fabric from "fabric";
  import { TextboxExt } from "$/fabric-object/textbox-ext";
  import Barcode from "$/fabric-object/barcode";
  import QRCode from "$/fabric-object/qrcode";
  import type { LabelProps } from "$/types";
  import { DEFAULT_LABEL_PRESETS, FONT_FAMILIES } from "$/defaults";

  interface Props {
    selection: fabric.FabricObject | null;
    /** bumped by the parent on object:modified so displayed values refresh */
    rev: number;
    labelProps: LabelProps;
    dpmm: number;
    onChanged: () => void;
    onDelete: () => void;
    /** apply a new label size (millimetres) */
    onLabelSize: (widthMm: number, heightMm: number) => void;
    /** update non-dimension label properties (shape, split, mirror) */
    onLabelProps: (patch: Partial<LabelProps>) => void;
  }

  let { selection, rev, labelProps, dpmm, onChanged, onDelete, onLabelSize, onLabelProps }: Props =
    $props();

  const px2mm = (px: number) => Math.round((px / dpmm) * 10) / 10;
  const mm2px = (mm: number) => mm * dpmm;

  // Size presets available at the current resolution (D110 = 8 px/mm).
  const sizePresets = DEFAULT_LABEL_PRESETS.filter((p) => p.dpmm === dpmm);

  const setLabelDim = (dim: "width" | "height", value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    const wMm = px2mm(labelProps.size.width);
    const hMm = px2mm(labelProps.size.height);
    onLabelSize(dim === "width" ? num : wMm, dim === "height" ? num : hMm);
  };

  const presetActive = (wMm: number, hMm: number) =>
    px2mm(labelProps.size.width) === wMm && px2mm(labelProps.size.height) === hMm;

  const SHAPES = [
    ["rect", "Rect"],
    ["rounded_rect", "Round"],
    ["circle", "Circle"],
  ] as const;

  const objectTitle = (obj: fabric.FabricObject): string => {
    if (obj instanceof TextboxExt) return "Text";
    if (obj instanceof Barcode) return "Barcode";
    if (obj instanceof QRCode) return "QR code";
    if (obj instanceof fabric.Circle) return "Circle";
    if (obj instanceof fabric.Polyline) return "Line";
    if (obj instanceof fabric.FabricImage) return "Image";
    if (obj instanceof fabric.Rect) return "Rectangle";
    return "Object";
  };

  const setNum = (prop: "left" | "top" | "angle", value: string, mm: boolean) => {
    if (!selection) return;
    const num = parseFloat(value);
    if (isNaN(num)) return;
    selection.set(prop, mm ? mm2px(num) : num);
    selection.setCoords();
    onChanged();
  };

  const setObjProp = (prop: string, value: unknown) => {
    if (!selection) return;
    selection.set(prop as keyof fabric.FabricObject, value);
    selection.setCoords();
    onChanged();
  };

  const centerH = () => {
    if (!selection?.canvas) return;
    selection.canvas.centerObjectH(selection);
    selection.setCoords();
    onChanged();
  };

  const centerV = () => {
    if (!selection?.canvas) return;
    selection.canvas.centerObjectV(selection);
    selection.setCoords();
    onChanged();
  };

  const arrange = (to: "front" | "back") => {
    if (!selection?.canvas) return;
    if (to === "front") selection.canvas.bringObjectToFront(selection);
    else selection.canvas.sendObjectToBack(selection);
    onChanged();
  };

  /** Set the text box width to (nearly) the label width so long text wraps to lines. */
  const fitTextWidth = () => {
    if (!selection) return;
    const w = Math.max(labelProps.size.width - 8, 8);
    selection.set("width", w);
    selection.canvas?.centerObjectH(selection);
    selection.setCoords();
    onChanged();
  };
</script>

<div class="props">
  <div class="p-head">
    <b>{selection ? objectTitle(selection) : "Label"}</b>
    <span>{selection ? "SELECTED" : "NO SELECTION"}</span>
  </div>

  {#if selection}
    {#key `${rev}-${selection.constructor.name}`}
      <div class="sec">
        <h3>Position</h3>
        <div class="grid2">
          <div class="field">
            <label for="pp-x">X · mm</label>
            <input id="pp-x" class="v" type="number" step="0.5" value={px2mm(selection.left ?? 0)}
              onchange={(e) => setNum("left", e.currentTarget.value, true)} />
          </div>
          <div class="field">
            <label for="pp-y">Y · mm</label>
            <input id="pp-y" class="v" type="number" step="0.5" value={px2mm(selection.top ?? 0)}
              onchange={(e) => setNum("top", e.currentTarget.value, true)} />
          </div>
          <div class="field">
            <label for="pp-a">Angle · °</label>
            <input id="pp-a" class="v" type="number" step="15" value={Math.round(selection.angle ?? 0)}
              onchange={(e) => setNum("angle", e.currentTarget.value, false)} />
          </div>
          <div class="field">
            <label for="pp-w">W × H · mm</label>
            <div class="v ro">{px2mm(selection.getScaledWidth())} × {px2mm(selection.getScaledHeight())}</div>
          </div>
        </div>
      </div>

      <div class="sec">
        <h3>Arrange</h3>
        <div class="arrange">
          <button onclick={centerH} title="Center horizontally">⭰ Center H</button>
          <button onclick={centerV} title="Center vertically">⭱ Center V</button>
          <button onclick={() => arrange("front")} title="Bring to front">⬆ To front</button>
          <button onclick={() => arrange("back")} title="Send to back">⬇ To back</button>
        </div>
      </div>

      {#if selection instanceof TextboxExt}
        <div class="sec">
          <h3>Text</h3>
          <div class="field" style="margin-bottom:8px">
            <label for="pp-ff">Font</label>
            <select id="pp-ff" class="v" value={selection.fontFamily}
              onchange={(e) => setObjProp("fontFamily", e.currentTarget.value)}>
              {#each FONT_FAMILIES as f (f.value)}
                <option value={f.value}>{f.label}</option>
              {/each}
            </select>
          </div>
          <div class="grid2" style="margin-bottom:8px">
            <div class="field">
              <label for="pp-fs">Size · px</label>
              <input id="pp-fs" class="v" type="number" min="4" value={selection.fontSize}
                onchange={(e) => setObjProp("fontSize", parseFloat(e.currentTarget.value) || 12)} />
            </div>
            <div class="field">
              <label for="pp-fw">Bold</label>
              <button id="pp-fw" class="v toggle" class:on={selection.fontWeight === "bold"}
                onclick={() => setObjProp("fontWeight", selection && (selection as TextboxExt).fontWeight === "bold" ? "normal" : "bold")}>
                {selection.fontWeight === "bold" ? "ON" : "OFF"}
              </button>
            </div>
          </div>
          <div class="seg">
            {#each ["left", "center", "right"] as align (align)}
              <button class:on={(selection as TextboxExt).textAlign === align} onclick={() => setObjProp("textAlign", align)}>
                {align}
              </button>
            {/each}
          </div>
          <div class="grid2" style="margin-top:8px">
            <div class="field">
              <label for="pp-af">Auto-fit font</label>
              <button id="pp-af" class="v toggle" class:on={(selection as TextboxExt).fontAutoSize}
                onclick={() => setObjProp("fontAutoSize", !(selection as TextboxExt).fontAutoSize)}>
                {(selection as TextboxExt).fontAutoSize ? "ON" : "OFF"}
              </button>
            </div>
            <div class="field">
              <label for="pp-fw2">Wrap width</label>
              <button id="pp-fw2" class="v toggle" onclick={fitTextWidth}>Fit label</button>
            </div>
          </div>
        </div>
      {:else if selection instanceof Barcode}
        <div class="sec">
          <h3>Barcode</h3>
          <div class="field" style="margin-bottom:8px">
            <label for="pp-bt">Content</label>
            <input id="pp-bt" class="v" type="text" value={selection.text}
              onchange={(e) => setObjProp("text", e.currentTarget.value)} />
          </div>
          <div class="grid2">
            <div class="field">
              <label for="pp-be">Encoding</label>
              <select id="pp-be" class="v" value={selection.encoding}
                onchange={(e) => setObjProp("encoding", e.currentTarget.value)}>
                <option value="CODE128B">CODE128B</option>
                <option value="EAN13">EAN13</option>
              </select>
            </div>
            <div class="field">
              <label for="pp-bp">Caption</label>
              <button id="pp-bp" class="v toggle" class:on={selection.printText}
                onclick={() => setObjProp("printText", !(selection as Barcode).printText)}>
                {selection.printText ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>
      {:else if selection instanceof QRCode}
        <div class="sec">
          <h3>QR code</h3>
          <div class="field">
            <label for="pp-qt">Content</label>
            <input id="pp-qt" class="v" type="text" value={selection.text}
              onchange={(e) => setObjProp("text", e.currentTarget.value)} />
          </div>
        </div>
      {/if}

      <div class="sec">
        <button class="delete" onclick={onDelete}>Delete object</button>
      </div>
    {/key}
  {:else}
    {#key `${labelProps.size.width}x${labelProps.size.height}`}
      <div class="sec">
        <h3>Label size</h3>
        <div class="grid2">
          <div class="field">
            <label for="pp-lw">W · mm</label>
            <input id="pp-lw" class="v" type="number" min="1" step="1" value={px2mm(labelProps.size.width)}
              onchange={(e) => setLabelDim("width", e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="pp-lh">H · mm</label>
            <input id="pp-lh" class="v" type="number" min="1" step="1" value={px2mm(labelProps.size.height)}
              onchange={(e) => setLabelDim("height", e.currentTarget.value)} />
          </div>
        </div>
        {#if sizePresets.length}
          <div class="presets">
            {#each sizePresets as p (p.width + "x" + p.height)}
              <button class:on={presetActive(p.width, p.height)} onclick={() => onLabelSize(p.width, p.height)}>
                {p.width}×{p.height}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/key}

    <div class="sec">
      <h3>Shape</h3>
      <div class="seg">
        {#each SHAPES as [val, lbl] (val)}
          <button class:on={(labelProps.shape ?? "rect") === val} onclick={() => onLabelProps({ shape: val })}>
            {lbl}
          </button>
        {/each}
      </div>
    </div>

    <div class="sec">
      <h3>Layout</h3>
      <div class="grid2" style="margin-bottom:8px">
        <div class="field">
          <label for="pp-split">Split</label>
          <select id="pp-split" class="v" value={labelProps.split ?? "none"}
            onchange={(e) => onLabelProps({ split: e.currentTarget.value as LabelProps["split"] })}>
            <option value="none">None</option>
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal</option>
          </select>
        </div>
        {#if (labelProps.split ?? "none") !== "none"}
          <div class="field">
            <label for="pp-parts">Parts</label>
            <input id="pp-parts" class="v" type="number" min="2" step="1" value={labelProps.splitParts ?? 2}
              onchange={(e) => onLabelProps({ splitParts: Math.max(2, parseInt(e.currentTarget.value) || 2) })} />
          </div>
        {/if}
      </div>
      <div class="field">
        <label for="pp-mirror">Mirror</label>
        <select id="pp-mirror" class="v" value={labelProps.mirror ?? "none"}
          onchange={(e) => onLabelProps({ mirror: e.currentTarget.value as LabelProps["mirror"] })}>
          <option value="none">None</option>
          <option value="copy">Copy</option>
          <option value="flip">Flip</option>
        </select>
      </div>
    </div>

    <div class="sec hint">Add an object from the left rail, or click one on the canvas to edit it. Double-click text to type.</div>
  {/if}
</div>

<style>
  .props {
    width: 272px;
    flex: none;
    background: var(--raised);
    border-left: 1.5px solid var(--ink);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .p-head {
    padding: 10px 14px;
    border-bottom: 1.5px solid var(--ink);
    background: var(--paper);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: none;
  }

  .p-head b {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .p-head span {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-3);
  }

  .sec {
    border-bottom: 1px solid var(--line);
    padding: 12px 14px;
  }

  .sec h3 {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--ink-3);
    margin: 0 0 10px;
  }

  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .field label {
    display: block;
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--ink-3);
    margin-bottom: 3px;
    text-transform: uppercase;
  }

  .v {
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 500;
    padding: 6px 8px;
    background: var(--paper);
    border: 1px solid var(--line-2);
    border-radius: 4px;
    color: var(--ink);
    width: 100%;
    box-sizing: border-box;
  }

  .v:focus {
    outline: none;
    border-color: var(--ink);
  }

  .v.ro {
    color: var(--ink-3);
  }

  .v.toggle {
    cursor: pointer;
    text-align: left;
  }

  .v.toggle.on {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }

  .seg {
    display: flex;
    border: 1.5px solid var(--ink);
    border-radius: 4px;
    overflow: hidden;
  }

  .seg button {
    flex: 1;
    border: 0;
    background: var(--raised);
    padding: 6px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
    border-right: 1px solid var(--line);
    font-family: var(--font-ui);
    text-transform: capitalize;
  }

  .seg button:last-child {
    border-right: 0;
  }

  .seg button.on {
    background: var(--ink);
    color: var(--paper);
  }

  .arrange {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .arrange button {
    border: 1.5px solid var(--line-2);
    border-radius: 4px;
    background: var(--raised);
    padding: 7px 0;
    font-family: var(--font-ui);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
  }

  .arrange button:hover {
    border-color: var(--ink);
    color: var(--ink);
  }

  .presets {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }

  .presets button {
    flex: 1;
    border: 1.5px solid var(--line-2);
    border-radius: 4px;
    background: var(--raised);
    padding: 6px 0;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
  }

  .presets button:hover {
    border-color: var(--ink);
    color: var(--ink);
  }

  .presets button.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .delete {
    width: 100%;
    font-family: var(--font-ui);
    font-size: 12.5px;
    font-weight: 600;
    padding: 8px 0;
    border-radius: 4px;
    cursor: pointer;
    border: 1.5px solid var(--red-2);
    background: var(--raised);
    color: var(--red-2);
  }

  .delete:hover {
    background: var(--red);
    border-color: var(--red-2);
    color: #fff8f0;
  }

  .hint {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.5;
  }
</style>
