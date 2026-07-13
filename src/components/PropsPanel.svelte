<script lang="ts">
  import * as fabric from "fabric";
  import { TextboxExt } from "$/fabric-object/textbox-ext";
  import Barcode from "$/fabric-object/barcode";
  import QRCode from "$/fabric-object/qrcode";
  import type { LabelProps } from "$/types";
  import { DEFAULT_LABEL_PRESETS, FONT_FAMILIES } from "$/defaults";
  import {
    alignActiveSelection,
    distributeActiveSelection,
    type SelectionAlignment,
    type SelectionDistribution,
  } from "$/utils/selection_utils";

  interface Props {
    selection: fabric.FabricObject | null;
    /** bumped by the parent on object:modified so displayed values refresh */
    rev: number;
    labelProps: LabelProps;
    dpmm: number;
    customFontFamilies: string[];
    missingFontFamilies: string[];
    onChanged: () => void;
    onDelete: () => void;
    onGroup: () => void;
    onUngroup: () => void;
    /** apply a new label size (millimetres) */
    onLabelSize: (widthMm: number, heightMm: number) => void;
    /** update non-dimension label properties (shape, split, mirror) */
    onLabelProps: (patch: Partial<LabelProps>) => void;
  }

  let {
    selection,
    rev,
    labelProps,
    dpmm,
    customFontFamilies,
    missingFontFamilies,
    onChanged,
    onDelete,
    onGroup,
    onUngroup,
    onLabelSize,
    onLabelProps,
  }: Props = $props();

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
    if (obj instanceof fabric.ActiveSelection) return `${obj.size()} objects`;
    if (obj instanceof fabric.Group) return "Group";
    if (obj instanceof TextboxExt) return "Text";
    if (obj instanceof Barcode) return "Barcode";
    if (obj instanceof QRCode) return "QR code";
    if (obj instanceof fabric.Circle) return "Circle";
    if (obj instanceof fabric.Polyline) return "Line";
    if (obj instanceof fabric.FabricImage) return "Image";
    if (obj instanceof fabric.Rect) return "Rectangle";
    return "Object";
  };

  const activeSelection = () => selection instanceof fabric.ActiveSelection ? selection : null;
  const selectedTextObjects = () => {
    const active = activeSelection();
    if (!active) return [];
    const objects = active.getObjects();
    return objects.every((object) => object instanceof TextboxExt) ? objects as TextboxExt[] : [];
  };

  const commonValue = <T,>(values: T[]): T | undefined =>
    values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined;

  const fontOptions = () => {
    const seen = new Set<string>();
    return [...FONT_FAMILIES, ...customFontFamilies.map((family) => ({ label: family, value: family }))]
      .filter((font) => {
        const key = font.value.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const isMissingFont = (family?: string) =>
    family !== undefined && missingFontFamilies.some((value) => value.toLocaleLowerCase() === family.toLocaleLowerCase());

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

  const alignSelection = (alignment: SelectionAlignment) => {
    const active = activeSelection();
    if (!active) return;
    alignActiveSelection(active, alignment);
    onChanged();
  };

  const distributeSelection = (distribution: SelectionDistribution) => {
    const active = activeSelection();
    if (!active) return;
    distributeActiveSelection(active, distribution);
    onChanged();
  };

  const setBulkTextProp = (prop: keyof TextboxExt, value: unknown) => {
    const objects = selectedTextObjects();
    if (objects.length === 0) return;
    objects.forEach((object) => {
      object.set(prop as keyof fabric.FabricObject, value);
      object.setCoords();
    });
    activeSelection()?.triggerLayout();
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

  /** Grow or shrink selected text to fill 90% of the label, then center it. */
  const fillTextToLabel = () => {
    if (!(selection instanceof TextboxExt) || !selection.text.trim()) return;
    selection.set("textAlign", "center");
    selection.fitFontToBounds(labelProps.size.width * 0.9, labelProps.size.height * 0.9);
    selection.canvas?.centerObject(selection);
    selection.setCoords();
    onChanged();
  };

  /** Objects whose scaled size can be typed directly (vector shapes, not text/image/codes). */
  const sizeEditable = (obj: fabric.FabricObject) =>
    !(
      obj instanceof fabric.Group || obj instanceof TextboxExt || obj instanceof fabric.FabricImage ||
      obj instanceof Barcode || obj instanceof QRCode
    );

  /** Set the scaled width/height (mm) of a vector shape via its scale factor.
   *  getScaledWidth/Height include the stroke, so back that out for an exact round-trip. */
  const setScaledDim = (dim: "w" | "h", value: string) => {
    if (!selection) return;
    const mm = parseFloat(value);
    if (isNaN(mm) || mm <= 0) return;
    const target = mm2px(mm);
    if (dim === "w") {
      const base = selection.width || 1;
      const strokePart = selection.getScaledWidth() - base * selection.scaleX;
      selection.scaleX = Math.max((target - strokePart) / base, 0.001);
    } else {
      const base = selection.height || 1;
      const strokePart = selection.getScaledHeight() - base * selection.scaleY;
      selection.scaleY = Math.max((target - strokePart) / base, 0.001);
    }
    selection.setCoords();
    onChanged();
  };

  /** Scale an image to fit inside the label (contain), then center it. */
  const fitImageToLabel = () => {
    if (!(selection instanceof fabric.FabricImage)) return;
    const scale = Math.min(
      labelProps.size.width / (selection.width || 1),
      labelProps.size.height / (selection.height || 1),
    );
    selection.scale(scale);
    selection.canvas?.centerObject(selection);
    selection.setCoords();
    onChanged();
  };
</script>

<div class="props">
  <div class="p-head">
    <b>{selection ? objectTitle(selection) : "Label"}</b>
    <span>{selection instanceof fabric.ActiveSelection ? `${selection.size()} SELECTED` : selection ? "SELECTED" : "NO SELECTION"}</span>
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
            {#if sizeEditable(selection)}
              <div class="wh">
                <input class="v" type="number" step="0.5" min="0.5" value={px2mm(selection.getScaledWidth())}
                  onchange={(e) => setScaledDim("w", e.currentTarget.value)} />
                <span>×</span>
                <input class="v" type="number" step="0.5" min="0.5" value={px2mm(selection.getScaledHeight())}
                  onchange={(e) => setScaledDim("h", e.currentTarget.value)} />
              </div>
            {:else}
              <div class="v ro">{px2mm(selection.getScaledWidth())} × {px2mm(selection.getScaledHeight())}</div>
            {/if}
          </div>
        </div>
      </div>

      <div class="sec">
        <h3>Arrange</h3>
        {#if selection instanceof fabric.ActiveSelection}
          <div class="arrange align-grid">
            <button onclick={() => alignSelection("left")}>Left</button>
            <button onclick={() => alignSelection("center-h")}>Center H</button>
            <button onclick={() => alignSelection("right")}>Right</button>
            <button onclick={() => alignSelection("top")}>Top</button>
            <button onclick={() => alignSelection("center-v")}>Center V</button>
            <button onclick={() => alignSelection("bottom")}>Bottom</button>
          </div>
          <h3 class="subhead">Distribute</h3>
          <div class="arrange">
            <button onclick={() => distributeSelection("horizontal")} disabled={selection.size() < 3}>H gaps</button>
            <button onclick={() => distributeSelection("vertical")} disabled={selection.size() < 3}>V gaps</button>
          </div>
          <h3 class="subhead">Selection</h3>
          <div class="arrange">
            <button onclick={centerH} title="Center selection horizontally on label">⭰ Label H</button>
            <button onclick={centerV} title="Center selection vertically on label">⭱ Label V</button>
            <button onclick={() => arrange("front")} title="Bring selection to front">⬆ To front</button>
            <button onclick={() => arrange("back")} title="Send selection to back">⬇ To back</button>
          </div>
          <button class="fit-btn group-btn" onclick={onGroup}>Group selection</button>
        {:else}
          <div class="arrange">
            <button onclick={centerH} title="Center horizontally">⭰ Center H</button>
            <button onclick={centerV} title="Center vertically">⭱ Center V</button>
            <button onclick={() => arrange("front")} title="Bring to front">⬆ To front</button>
            <button onclick={() => arrange("back")} title="Send to back">⬇ To back</button>
          </div>
          {#if selection instanceof fabric.Group}
            <button class="fit-btn group-btn" onclick={onUngroup}>Ungroup</button>
          {/if}
        {/if}
      </div>

      {#if selection instanceof fabric.ActiveSelection && selectedTextObjects().length > 0}
        {@const textObjects = selectedTextObjects()}
        {@const commonFont = commonValue(textObjects.map((object) => object.fontFamily))}
        {@const commonSize = commonValue(textObjects.map((object) => object.fontSize))}
        {@const commonWeight = commonValue(textObjects.map((object) => object.fontWeight))}
        {@const commonAlign = commonValue(textObjects.map((object) => object.textAlign))}
        <div class="sec">
          <h3>Bulk text</h3>
          <div class="field" style="margin-bottom:8px">
            <label for="pp-bulk-ff">Font</label>
            <select id="pp-bulk-ff" class="v" value={commonFont ?? ""}
              onchange={(e) => setBulkTextProp("fontFamily", e.currentTarget.value)}>
              {#if commonFont === undefined}<option value="" disabled>Mixed</option>{/if}
              {#if isMissingFont(commonFont)}<option value={commonFont}>{commonFont} (missing)</option>{/if}
              {#each fontOptions() as f (f.value)}
                <option value={f.value}>{f.label}</option>
              {/each}
            </select>
            {#if textObjects.some((object) => isMissingFont(object.fontFamily))}
              <div class="font-warning">A selected font is unavailable. Printing would use a fallback.</div>
            {/if}
          </div>
          <div class="grid2" style="margin-bottom:8px">
            <div class="field">
              <label for="pp-bulk-fs">Size · px</label>
              <input id="pp-bulk-fs" class="v" type="number" min="4" value={commonSize ?? ""} placeholder="Mixed"
                onchange={(e) => setBulkTextProp("fontSize", parseFloat(e.currentTarget.value) || 12)} />
            </div>
            <div class="field">
              <label for="pp-bulk-fw">Bold</label>
              <button id="pp-bulk-fw" class="v toggle" class:on={commonWeight === "bold"}
                onclick={() => setBulkTextProp("fontWeight", commonWeight === "bold" ? "normal" : "bold")}>
                {commonWeight === undefined ? "MIXED" : commonWeight === "bold" ? "ON" : "OFF"}
              </button>
            </div>
          </div>
          <div class="seg">
            {#each ["left", "center", "right"] as align (align)}
              <button class:on={commonAlign === align} onclick={() => setBulkTextProp("textAlign", align)}>{align}</button>
            {/each}
          </div>
        </div>
      {:else if selection instanceof TextboxExt}
        <div class="sec">
          <h3>Text</h3>
          <div class="field" style="margin-bottom:8px">
            <label for="pp-ff">Font</label>
            <select id="pp-ff" class="v" value={selection.fontFamily}
              onchange={(e) => setObjProp("fontFamily", e.currentTarget.value)}>
              {#if isMissingFont(selection.fontFamily)}<option value={selection.fontFamily}>{selection.fontFamily} (missing)</option>{/if}
              {#each fontOptions() as f (f.value)}
                <option value={f.value}>{f.label}</option>
              {/each}
            </select>
            {#if isMissingFont(selection.fontFamily)}
              <div class="font-warning">Font unavailable - printing would use a fallback.</div>
            {/if}
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
          <div class="field" style="margin-top:8px">
            <label for="pp-fill-label">Fill label</label>
            <button id="pp-fill-label" class="fit-btn" onclick={fillTextToLabel}
              title="Resize and center this text within 90% of the label">
              Fit text to 90%
            </button>
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
      {:else if selection instanceof fabric.FabricImage}
        <div class="sec">
          <h3>Image</h3>
          <button class="fit-btn" onclick={fitImageToLabel}>Fit to label</button>
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

  .font-warning {
    margin-top: 5px;
    color: var(--red-2);
    font-family: var(--font-mono);
    font-size: 9px;
    line-height: 1.35;
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

  .wh {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .wh input {
    min-width: 0;
    flex: 1;
  }

  .wh span {
    color: var(--ink-3);
    font-size: 11px;
  }

  .fit-btn {
    width: 100%;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 0;
    border-radius: 4px;
    cursor: pointer;
    border: 1.5px solid var(--line-2);
    background: var(--raised);
    color: var(--ink-2);
  }

  .fit-btn:hover {
    border-color: var(--ink);
    color: var(--ink);
  }

  .arrange {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .arrange.align-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .sec h3.subhead {
    margin-top: 12px;
  }

  .group-btn {
    margin-top: 8px;
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

  .arrange button:disabled {
    opacity: 0.4;
    cursor: default;
    border-color: var(--line-2);
    color: var(--ink-3);
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
