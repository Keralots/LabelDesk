<script lang="ts">
  import { onMount } from "svelte";
  import * as fabric from "fabric";
  import { CustomCanvas } from "$/fabric-object/custom_canvas";
  import { TextboxExt } from "$/fabric-object/textbox-ext";
  import Barcode from "$/fabric-object/barcode";
  import QRCode from "$/fabric-object/qrcode";
  import ToolRail, { type ToolKind } from "$/components/ToolRail.svelte";
  import PropsPanel from "$/components/PropsPanel.svelte";
  import { FileUtils } from "$/utils/file_utils";
  import { CanvasUtils } from "$/utils/canvas_utils";
  import {
    DEFAULT_LABEL_PROPS,
    OBJECT_DEFAULTS,
    OBJECT_DEFAULTS_TEXT,
    OBJECT_DEFAULTS_VECTOR,
    OBJECT_SIZE_DEFAULTS,
  } from "$/defaults";
  import PrintDialog from "$/components/PrintDialog.svelte";
  import LibraryDialog from "$/components/LibraryDialog.svelte";
  import DataDialog from "$/components/DataDialog.svelte";
  import FontsDialog from "$/components/FontsDialog.svelte";
  import LayersPanel from "$/components/LayersPanel.svelte";
  import CanvasContextMenu from "$/components/CanvasContextMenu.svelte";
  import ShortcutsDialog from "$/components/ShortcutsDialog.svelte";
  import AboutDialog from "$/components/AboutDialog.svelte";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import { UndoRedo } from "$/utils/undo_redo";
  import { ExportedLabelTemplateSchema, LabelPropsSchema } from "$/types";
  import type { EditorSession, ExportedLabelTemplate, LabelProps } from "$/types";
  import { connect, disconnect, connectionState, printerName, heartbeat } from "$/printer";
  import type { FabricJson } from "$/types";
  import { csvData, loadedFontFamilies, userFonts } from "$/stores";
  import { parseBatchCsv } from "$/utils/batch_data";
  import {
    fontFamiliesUsedByCanvas,
    fontsUsedByCanvas,
    mergeUserFonts,
    missingFontFamilies as findMissingFontFamilies,
    syncUserFonts,
  } from "$/utils/font_utils";
  import { isObjectLocked, restoreObjectLock, setObjectLocked } from "$/utils/layer_utils";
  import {
    MAX_IMAGE_FILE_BYTES,
    assertFileSize,
    assertImageDimensions,
  } from "$/utils/import_safety";

  let canvasEl: HTMLCanvasElement;
  let canvasAreaEl: HTMLElement;
  let canvas = $state<CustomCanvas | undefined>();
  let zoomPercent = $state(100);
  let selection = $state<fabric.FabricObject | null>(null);
  let rev = $state(0);
  let undoDisabled = $state(true);
  let redoDisabled = $state(true);
  let labelProps = $state<LabelProps>({
    printDirection: DEFAULT_LABEL_PROPS.printDirection,
    size: { ...DEFAULT_LABEL_PROPS.size },
  });
  let documentTitle = $state("Untitled");
  let dirty = $state(false);
  let autosaveState = $state<"idle" | "saving" | "saved" | "error">("idle");
  let batchEnabled = $state(false);
  let layersOpen = $state(false);
  let shortcutsOpen = $state(false);
  let aboutOpen = $state(false);
  let safeAreaVisible = $state(true);
  let smartSnap = $state(true);
  let contextMenu = $state({ open: false, x: 0, y: 0 });
  const batchRowCount = $derived(parseBatchCsv($csvData.data).rows.length);
  const usedFontFamilies = $derived.by(() => {
    void rev;
    return canvas ? fontFamiliesUsedByCanvas(canvas.toJSON() as FabricJson) : [];
  });
  const missingFontFamilies = $derived.by(() => {
    void rev;
    return canvas ? findMissingFontFamilies(canvas.toJSON() as FabricJson, $loadedFontFamilies) : [];
  });
  const embeddableFontCount = $derived.by(() => {
    void rev;
    return canvas ? fontsUsedByCanvas(canvas.toJSON() as FabricJson, $userFonts).length : 0;
  });

  const DPMM = 8; // 203 dpi
  const AUTOSAVE_DELAY_MS = 400;
  // Breakpoint below which the editor switches to the stacked mobile layout.
  // Keep in sync with the @media rules in this file and the panel components.
  const isNarrowViewport = () => window.matchMedia("(max-width: 768px)").matches;

  const undoRedo = new UndoRedo();
  let autosaveReady = false;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let cleanFingerprint = "";

  const hashFingerprint = (value: string): string => {
    let hash = 14_695_981_039_346_656_037n;
    for (let index = 0; index < value.length; index++) {
      hash ^= BigInt(value.charCodeAt(index));
      hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
    }
    return hash.toString(16).padStart(16, "0");
  };

  const documentFingerprint = (): string => {
    if (!canvas) return "";
    return hashFingerprint(
      JSON.stringify({
        canvas: CanvasUtils.serializeCanvas(canvas),
        label: LabelPropsSchema.parse(labelProps),
        batchEnabled,
        csv: batchEnabled ? $csvData : undefined,
      }),
    );
  };

  const makeEditorSession = (): EditorSession | null => {
    if (!canvas) return null;
    return {
      version: 1,
      canvas: CanvasUtils.serializeCanvas(canvas),
      label: labelProps,
      title: documentTitle,
      batchEnabled,
      csv: batchEnabled ? $csvData : undefined,
      dirty,
    };
  };

  const flushAutosave = () => {
    if (autosaveTimer !== undefined) {
      clearTimeout(autosaveTimer);
      autosaveTimer = undefined;
    }
    if (!autosaveReady) return;
    const session = makeEditorSession();
    if (!session) return;
    try {
      LocalStoragePersistence.saveEditorSession(session);
      autosaveState = "saved";
    } catch (error) {
      autosaveState = "error";
      console.error("Recovery save failed:", error);
    }
  };

  const scheduleAutosave = () => {
    if (!autosaveReady || !canvas) return;
    if (autosaveTimer !== undefined) clearTimeout(autosaveTimer);
    autosaveState = "saving";
    autosaveTimer = setTimeout(flushAutosave, AUTOSAVE_DELAY_MS);
  };

  const documentChanged = () => {
    if (!autosaveReady || !canvas) return;
    dirty = documentFingerprint() !== cleanFingerprint;
    scheduleAutosave();
  };

  const markDocumentClean = () => {
    if (!canvas) return;
    cleanFingerprint = documentFingerprint();
    dirty = false;
    scheduleAutosave();
  };

  /** Resize the label (dimensions in millimetres). Undoable. */
  const applyLabelSize = (widthMm: number, heightMm: number) => {
    if (!canvas) return;
    const width = Math.round(widthMm * DPMM);
    const height = Math.round(heightMm * DPMM);
    if (width <= 0 || height <= 0) return;
    if (width === labelProps.size.width && height === labelProps.size.height) return;
    labelProps = { ...labelProps, size: { width, height } };
    canvas.setLabelProps(labelProps);
    canvas.setSafeAreaVisible(safeAreaVisible);
    canvas.setSmartSnap(smartSnap);
    canvas.on("object:added", (event) => {
      if (event.target) restoreObjectLock(event.target);
    });
    canvas.setLabelSize(width, height);
    rev++;
    commit();
  };

  /** Update non-dimension label properties (shape, split, mirror). Undoable. */
  const updateLabelProps = (patch: Partial<LabelProps>) => {
    if (!canvas) return;
    labelProps = { ...labelProps, ...patch };
    canvas.setLabelProps(labelProps);
    canvas.renderAll();
    rev++;
    commit();
  };

  const refreshCanvas = () => {
    canvas?.renderAll();
    rev++;
  };

  /** Snapshot the current canvas into undo history. No-op while paused (during restore). */
  const commit = () => {
    if (!canvas) return;
    undoRedo.push(canvas, labelProps);
    documentChanged();
  };

  /** Prop-panel edits mutate objects programmatically (no fabric event), so commit explicitly. */
  const onPropChanged = () => {
    refreshCanvas();
    commit();
  };

  // Remember which object was selected so it can be reselected after a restore.
  let reselectIndex = -1;
  const captureSelectionIndex = () => {
    const active = canvas?.getActiveObject();
    reselectIndex = active ? canvas!.getObjects().indexOf(active) : -1;
  };
  const undo = () => {
    captureSelectionIndex();
    void undoRedo.undo();
  };
  const redo = () => {
    captureSelectionIndex();
    void undoRedo.redo();
  };

  const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp"];
  const pickFabricImage = async (): Promise<fabric.FabricImage | null> => {
    const fileList = await FileUtils.pickFileAsync(SUPPORTED_IMAGE_TYPES.join(","), false);
    const file = fileList[0];
    if (!file || !SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      console.error("Unsupported image type:", file?.type || "(none)");
      return null;
    }
    assertFileSize(file, MAX_IMAGE_FILE_BYTES, "Image");
    const dataUrl = await FileUtils.blobToDataUrl(file);
    const image = await fabric.FabricImage.fromURL(dataUrl);
    if (!image.width || !image.height) {
      console.error("Image failed to decode:", file.name);
      return null;
    }
    assertImageDimensions(image.width, image.height);
    return image;
  };

  const addObject = async (kind: ToolKind) => {
    if (!canvas) return;
    let obj: fabric.FabricObject | undefined;

    if (kind === "text") {
      obj = new TextboxExt("Text", { ...OBJECT_DEFAULTS_TEXT, fontSize: 24 });
    } else if (kind === "barcode") {
      // Barcode computes its own width from the encoded content, but the bar
      // height must be given explicitly; without it the object is created
      // near-zero high and scaling handles produce absurd scale factors.
      obj = new Barcode({
        ...OBJECT_DEFAULTS,
        text: "123456789",
        encoding: "CODE128B",
        scaleFactor: 2,
        height: OBJECT_SIZE_DEFAULTS.height,
      });
    } else if (kind === "qrcode") {
      obj = new QRCode({ ...OBJECT_DEFAULTS, text: "https://example.com", size: 60 });
    } else if (kind === "rect") {
      obj = new fabric.Rect({ ...OBJECT_DEFAULTS_VECTOR, width: 60, height: 40 });
    } else if (kind === "circle") {
      obj = new fabric.Circle({ ...OBJECT_DEFAULTS_VECTOR, radius: 24 });
    } else if (kind === "line") {
      obj = new fabric.Polyline(
        [
          { x: 0, y: 0 },
          { x: 80, y: 0 },
        ],
        { ...OBJECT_DEFAULTS_VECTOR },
      );
    } else if (kind === "image") {
      try {
        const img = await pickFabricImage();
        if (!img) return;
        // fit into the label, leaving a small margin
        const maxW = labelProps.size.width * 0.8;
        const maxH = labelProps.size.height * 0.8;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        img.scale(scale);
        obj = img;
      } catch (e) {
        console.error("Image load failed:", e);
        return;
      }
    }

    if (!obj) return;
    canvas.add(obj);
    canvas.centerObject(obj);
    canvas.setActiveObject(obj);
    refreshCanvas();
    commit();
  };

  const replaceImage = async (target: fabric.FabricImage) => {
    try {
      const replacement = await pickFabricImage();
      if (!replacement?.width || !replacement.height || !canvas || !canvas.getObjects().includes(target)) return;
      const frameWidth = target.getScaledWidth();
      const frameHeight = target.getScaledHeight();
      const center = target.getCenterPoint();
      const scale = Math.min(frameWidth / replacement.width, frameHeight / replacement.height);
      target.setElement(replacement.getElement(), { width: replacement.width, height: replacement.height });
      target.set({ cropX: 0, cropY: 0, scaleX: scale, scaleY: scale });
      target.setPositionByOrigin(center, "center", "center");
      target.applyFilters();
      target.setCoords();
      refreshCanvas();
      commit();
    } catch (error) {
      console.error("Image replacement failed:", error);
    }
  };

  const addPlaceholder = (column: string) => {
    if (!canvas) return;
    const obj = new TextboxExt(`{${column}}`, { ...OBJECT_DEFAULTS_TEXT, fontSize: 24 });
    canvas.add(obj);
    canvas.centerObject(obj);
    canvas.setActiveObject(obj);
    refreshCanvas();
    commit();
  };

  const deleteSelection = () => {
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    canvas.discardActiveObject();
    active.forEach((o) => canvas?.remove(o));
    refreshCanvas();
    commit();
  };

  const selectFromLayers = (object: fabric.FabricObject | null) => {
    selection = object;
    rev++;
  };

  const arrangeSelection = (position: "front" | "back") => {
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    if (position === "front") canvas.bringObjectToFront(active);
    else canvas.sendObjectToBack(active);
    refreshCanvas();
    commit();
  };

  const lockSelection = () => {
    if (!canvas) return;
    const objects = canvas.getActiveObjects();
    if (!objects.length) return;
    objects.forEach((object) => setObjectLocked(object, true));
    canvas.discardActiveObject();
    selection = null;
    refreshCanvas();
    commit();
  };

  const hideSelection = () => {
    if (!canvas) return;
    const objects = canvas.getActiveObjects();
    if (!objects.length) return;
    objects.forEach((object) => object.set("visible", false));
    canvas.discardActiveObject();
    selection = null;
    refreshCanvas();
    commit();
  };

  const openCanvasContextMenu = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest(".zoom-cluster")) return;
    event.preventDefault();
    if (!canvas) return;
    const target = canvas.findTarget(event).target;
    if (target && target.visible && !isObjectLocked(target) && !canvas.getActiveObjects().includes(target)) {
      canvas.discardActiveObject();
      canvas.setActiveObject(target);
      selection = target;
      canvas.renderAll();
    }
    contextMenu = { open: true, x: event.clientX, y: event.clientY };
  };

  const groupSelection = () => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!(active instanceof fabric.ActiveSelection) || active.size() < 2) return;

    const objects = [...active.getObjects()];
    const stack = canvas.getObjects();
    const insertAt = Math.min(...objects.map((object) => stack.indexOf(object)).filter((index) => index >= 0));
    canvas.discardActiveObject();
    canvas.remove(...objects);
    const group = new fabric.Group(objects);
    canvas.insertAt(Number.isFinite(insertAt) ? insertAt : canvas.size(), group);
    canvas.setActiveObject(group);
    selection = group;
    refreshCanvas();
    commit();
  };

  const ungroupSelection = () => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!(active instanceof fabric.Group) || active instanceof fabric.ActiveSelection) return;

    const insertAt = Math.max(0, canvas.getObjects().indexOf(active));
    canvas.discardActiveObject();
    const objects = active.removeAll();
    canvas.remove(active);
    canvas.insertAt(insertAt, ...objects);
    const nextSelection = new fabric.ActiveSelection(objects, { canvas });
    canvas.setActiveObject(nextSelection);
    selection = nextSelection;
    refreshCanvas();
    commit();
  };

  const insertClone = async (source: fabric.FabricObject, offset: number) => {
    if (!canvas) return;
    const clone = await source.clone();

    if (clone instanceof fabric.ActiveSelection) {
      const clones = clone.removeAll();
      clones.forEach((clone) => {
        const position = clone.getXY();
        clone.setXY(new fabric.Point(position.x + offset, position.y + offset));
        clone.setCoords();
      });
      canvas.discardActiveObject();
      canvas.add(...clones);
      const nextSelection = new fabric.ActiveSelection(clones, { canvas });
      canvas.setActiveObject(nextSelection);
      selection = nextSelection;
      refreshCanvas();
      commit();
      return;
    }

    clone.set({ left: (clone.left ?? 0) + offset, top: (clone.top ?? 0) + offset });
    clone.setCoords();
    canvas.discardActiveObject();
    canvas.add(clone);
    canvas.setActiveObject(clone);
    selection = clone;
    refreshCanvas();
    commit();
  };

  const duplicateSelection = async () => {
    const active = canvas?.getActiveObject();
    if (!active) return;
    await insertClone(active, 10);
  };

  let clipboardSource: Promise<fabric.FabricObject | null> = Promise.resolve(null);
  let clipboardAvailable = $state(false);
  let pasteOffset = 0;
  let pasteQueue = Promise.resolve();

  const storeClipboard = (active: fabric.FabricObject) => {
    clipboardAvailable = true;
    pasteOffset = 0;
    clipboardSource = active.clone().catch((error) => {
      clipboardAvailable = false;
      console.error("Could not copy selection:", error);
      return null;
    });
    return clipboardSource;
  };

  const copySelection = () => {
    const active = canvas?.getActiveObject();
    if (!active) return;
    void storeClipboard(active);
  };

  const cutSelection = async () => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    const objects = active instanceof fabric.ActiveSelection ? [...active.getObjects()] : [active];
    const copied = await storeClipboard(active);
    if (!copied) return;

    canvas.discardActiveObject();
    canvas.remove(...objects);
    selection = null;
    refreshCanvas();
    commit();
  };

  const pasteSelection = () => {
    const source = clipboardSource;
    pasteQueue = pasteQueue.then(async () => {
      const stored = await source;
      if (!stored) return;
      pasteOffset += 10;
      await insertClone(stored, pasteOffset);
    }).catch((error) => {
      console.error("Could not paste selection:", error);
    });
    return pasteQueue;
  };

  const selectAllObjects = () => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (objects.length === 0) return;
    canvas.discardActiveObject();
    const nextSelection = objects.length === 1
      ? objects[0]
      : new fabric.ActiveSelection(objects, { canvas });
    canvas.setActiveObject(nextSelection);
    selection = nextSelection;
    refreshCanvas();
  };

  // Arrow-key nudge. Moves are coalesced into one undo step per key press (see onKeyup).
  let nudgePending = false;
  let spaceHeld = false;
  let panState = $state<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const nudge = (dx: number, dy: number) => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy });
    active.setCoords();
    canvas.renderAll();
    rev++;
    nudgePending = true;
  };
  const onKeyup = (event: KeyboardEvent) => {
    if (event.code === "Space") spaceHeld = false;
    if (nudgePending) {
      nudgePending = false;
      commit();
    }
  };

  const onKeydown = (e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const inField = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
    const active = canvas?.getActiveObject();
    const editingText = active instanceof fabric.IText && active.isEditing;
    const modifier = e.ctrlKey || e.metaKey;
    const key = e.key.toLocaleLowerCase();

    if (e.key === "Escape" && contextMenu.open) {
      contextMenu.open = false;
      return;
    }
    if (e.key === "Escape" && shortcutsOpen) {
      shortcutsOpen = false;
      return;
    }
    if (e.key === "Escape" && aboutOpen) {
      aboutOpen = false;
      return;
    }

    if (!inField && !editingText && !printDialogOpen && !libraryOpen && !dataDialogOpen && !fontsDialogOpen) {
      if (e.code === "Space") {
        e.preventDefault();
        spaceHeld = true;
        return;
      }
      if (key === "?") {
        e.preventDefault();
        shortcutsOpen = true;
        return;
      }
      if (modifier && key === "0") {
        e.preventDefault();
        zoomToFit();
        return;
      }
      if (modifier && key === "1") {
        e.preventDefault();
        canvas?.resetVirtualZoom();
        return;
      }
    }

    if (printDialogOpen || libraryOpen || dataDialogOpen || fontsDialogOpen || shortcutsOpen || aboutOpen) return;

    if (modifier && key === "z") {
      if (inField || editingText) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && key === "y") {
      if (inField || editingText) return;
      e.preventDefault();
      redo();
      return;
    }
    if (modifier && key === "d") {
      if (inField || editingText || !active) return;
      e.preventDefault();
      void duplicateSelection();
      return;
    }
    if (modifier && key === "c") {
      if (inField || editingText || !active) return;
      e.preventDefault();
      copySelection();
      return;
    }
    if (modifier && key === "x") {
      if (inField || editingText || !active) return;
      e.preventDefault();
      void cutSelection();
      return;
    }
    if (modifier && key === "v") {
      if (inField || editingText || !clipboardAvailable) return;
      e.preventDefault();
      void pasteSelection();
      return;
    }
    if (modifier && key === "a") {
      if (inField || editingText || !canvas?.size()) return;
      e.preventDefault();
      selectAllObjects();
      return;
    }
    if (modifier && key === "g") {
      if (inField || editingText || !active) return;
      e.preventDefault();
      if (e.shiftKey) ungroupSelection();
      else groupSelection();
      return;
    }

    if (!inField && !editingText && active && e.key === "Escape") {
      canvas?.discardActiveObject();
      selection = null;
      refreshCanvas();
      return;
    }

    if (!inField && !editingText && active && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") nudge(-step, 0);
      else if (e.key === "ArrowRight") nudge(step, 0);
      else if (e.key === "ArrowUp") nudge(0, -step);
      else if (e.key === "ArrowDown") nudge(0, step);
      return;
    }

    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (inField || editingText) return;
    if (active) {
      e.preventDefault();
      deleteSelection();
    }
  };

  const onConnectClick = async () => {
    if ($connectionState === "connected") {
      await disconnect();
      return;
    }
    try {
      await connect();
    } catch (e) {
      console.error("Connect failed:", e);
    }
  };

  let printDialogOpen = $state(false);
  let libraryOpen = $state(false);
  let dataDialogOpen = $state(false);
  let fontsDialogOpen = $state(false);
  const getCanvasJson = (): FabricJson => CanvasUtils.serializeCanvas(canvas!);

  const saveLabelToLibrary = (title: string, includeCsv: boolean, includeFonts: boolean) => {
    if (!canvas) return;
    const tpl = FileUtils.makeExportedLabel(canvas, labelProps, includeCsv, includeFonts);
    const nextTitle = title || (documentTitle !== "Untitled" ? documentTitle : "");
    if (nextTitle) tpl.title = nextTitle;
    const existing = LocalStoragePersistence.loadLabels();
    const result = LocalStoragePersistence.saveLabels([...existing, tpl]);
    if (result.zodErrors.length > 0 || result.otherErrors.length > 0) {
      throw new Error("The label could not be saved to the local library.");
    }
    documentTitle = tpl.title || "Untitled";
    markDocumentClean();
  };

  const loadTemplate = async (tpl: ExportedLabelTemplate) => {
    if (!canvas) return;
    undoRedo.paused = true;
    try {
      if (tpl.fonts?.length) {
        const mergedFonts = mergeUserFonts($userFonts, tpl.fonts);
        $userFonts = mergedFonts;
        await syncUserFonts(mergedFonts);
      }
      canvas.discardActiveObject();
      selection = null;
      if (tpl.label?.size) {
        labelProps = { ...tpl.label, size: { ...tpl.label.size } };
        canvas.setLabelProps(labelProps);
        canvas.setLabelSize(labelProps.size.width, labelProps.size.height);
      }
      if (tpl.csv) {
        $csvData = tpl.csv;
        batchEnabled = true;
      } else {
        batchEnabled = false;
      }
      await FileUtils.loadCanvasState(canvas, tpl.canvas);
      canvas.renderAll();
      void CanvasUtils.ensureCanvasFonts(canvas);
      rev++;
    } finally {
      undoRedo.paused = false;
    }
    undoRedo.push(canvas, labelProps);
    documentTitle = tpl.title?.trim() || "Untitled";
    markDocumentClean();
  };

  const exportLabelJson = (includeCsv: boolean, includeFonts: boolean) => {
    if (!canvas) return;
    const tpl = FileUtils.makeExportedLabel(canvas, labelProps, includeCsv, includeFonts);
    if (documentTitle !== "Untitled") tpl.title = documentTitle;
    FileUtils.saveLabelAsJson(tpl);
    markDocumentClean();
  };

  const exportLabelPng = () => {
    if (!canvas) return;
    FileUtils.saveCanvasAsPng(canvas, documentTitle);
  };

  const importLabelJson = async () => {
    const text = await FileUtils.pickAndReadSingleTextFile("json");
    const tpl = ExportedLabelTemplateSchema.parse(JSON.parse(text));
    await loadTemplate(tpl);
    libraryOpen = false;
  };

  onMount(() => {
    let disposed = false;
    canvas = new CustomCanvas(canvasEl, {
      width: labelProps.size.width,
      height: labelProps.size.height,
    });
    canvas.setLabelProps(labelProps);
    const unsubscribeFonts = userFonts.subscribe((fonts) => {
      void syncUserFonts(fonts).then(() => {
        if (disposed || !canvas) return;
        CanvasUtils.refreshFontMetrics(canvas);
        rev++;
      });
    });
    canvas.onZoomChange = (zoom) => {
      zoomPercent = Math.round(zoom * 100);
    };

    const syncSelection = () => (selection = canvas?.getActiveObject() ?? null);
    canvas.on("selection:created", syncSelection);
    canvas.on("selection:updated", syncSelection);
    canvas.on("selection:cleared", () => (selection = null));
    // Fires for transforms (move/scale/rotate) and inline text edits that changed content.
    canvas.on("object:modified", () => {
      rev++;
      commit();
    });

    undoRedo.onStateUpdate = (s) => {
      undoDisabled = s.undoDisabled;
      redoDisabled = s.redoDisabled;
    };
    undoRedo.onLabelUpdate = async (data) => {
      if (!canvas) return;
      undoRedo.paused = true;
      canvas.discardActiveObject();
      selection = null;
      if (data.label) {
        const resized =
          data.label.size.width !== labelProps.size.width ||
          data.label.size.height !== labelProps.size.height;
        labelProps = { ...data.label, size: { ...data.label.size } };
        canvas.setLabelProps(labelProps);
        if (resized) canvas.setLabelSize(labelProps.size.width, labelProps.size.height);
      }
      await FileUtils.loadCanvasState(canvas, data.canvas);
      canvas.renderAll();
      // Reselect the object that was active before the restore, if it still exists.
      if (reselectIndex >= 0) {
        const objs = canvas.getObjects();
        if (objs[reselectIndex]) {
          canvas.setActiveObject(objs[reselectIndex]);
          selection = objs[reselectIndex];
        }
        reselectIndex = -1;
      }
      rev++;
      undoRedo.paused = false;
      documentChanged();
    };

    const addStarterLabel = () => {
      if (!canvas) return;
      // OBJECT_DEFAULTS_TEXT uses center origin, so left/top are the center point.
      const text = new TextboxExt("LabelDesk", {
        ...OBJECT_DEFAULTS_TEXT,
        left: labelProps.size.width / 2,
        top: labelProps.size.height / 2,
        fontSize: 32,
      });
      canvas.add(text);
    };

    const initializeDocument = async () => {
      if (!canvas) return;
      undoRedo.paused = true;
      let restoredSession: EditorSession | null = null;

      try {
        await syncUserFonts($userFonts);
        restoredSession = LocalStoragePersistence.loadEditorSession();
        if (restoredSession) {
          labelProps = {
            ...restoredSession.label,
            size: { ...restoredSession.label.size },
          };
          canvas.setLabelProps(labelProps);
          canvas.setLabelSize(labelProps.size.width, labelProps.size.height);
          if (restoredSession.csv) $csvData = restoredSession.csv;
          batchEnabled = restoredSession.batchEnabled;
          documentTitle = restoredSession.title.trim() || "Untitled";
          await FileUtils.loadCanvasState(canvas, restoredSession.canvas);
        } else {
          addStarterLabel();
        }
      } catch (error) {
        console.error("Recovery restore failed:", error);
        LocalStoragePersistence.clearEditorSession();
        canvas.clear();
        labelProps = {
          printDirection: DEFAULT_LABEL_PROPS.printDirection,
          size: { ...DEFAULT_LABEL_PROPS.size },
        };
        canvas.setLabelProps(labelProps);
        canvas.setLabelSize(labelProps.size.width, labelProps.size.height);
        documentTitle = "Untitled";
        batchEnabled = false;
        restoredSession = null;
        addStarterLabel();
      }

      if (disposed || !canvas) return;
      // On phones a fixed 200% zoom usually overflows the viewport; fit instead.
      if (isNarrowViewport()) zoomToFit();
      else canvas.virtualZoom(2);
      canvas.setSafeAreaVisible(safeAreaVisible);
      canvas.setSmartSnap(smartSnap);
      canvas.renderAll();
      void CanvasUtils.ensureCanvasFonts(canvas);
      rev++;
      undoRedo.paused = false;
      undoRedo.push(canvas, labelProps);

      cleanFingerprint = restoredSession?.dirty ? "recovered-dirty" : documentFingerprint();
      autosaveReady = true;
      dirty = restoredSession?.dirty ?? false;
      scheduleAutosave();
    };

    void initializeDocument();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__canvas = canvas;
    }

    return () => {
      disposed = true;
      flushAutosave();
      autosaveReady = false;
      unsubscribeFonts();
      canvas?.dispose();
    };
  });

  const zoomIn = () => canvas?.virtualZoomIn();
  const zoomOut = () => canvas?.virtualZoomOut();
  const zoomToFit = () => {
    if (!canvas || !canvasAreaEl) return;
    const margin = isNarrowViewport() ? 40 : 96;
    const availableWidth = Math.max(1, canvasAreaEl.clientWidth - margin);
    const availableHeight = Math.max(1, canvasAreaEl.clientHeight - margin);
    canvas.virtualZoom(Math.min(availableWidth / canvas.getWidth(), availableHeight / canvas.getHeight(), 4));
  };

  const startPan = (event: PointerEvent) => {
    if (event.button === 2) {
      // Keep the current selection until the context-menu handler decides
      // whether another object was clicked.
      event.stopPropagation();
      return;
    }
    if (event.button !== 1 && !(spaceHeld && event.button === 0)) return;
    event.preventDefault();
    event.stopPropagation();
    contextMenu.open = false;
    const area = event.currentTarget as HTMLElement;
    area.setPointerCapture(event.pointerId);
    panState = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: area.scrollLeft,
      scrollTop: area.scrollTop,
    };
    if (canvas) canvas.selection = false;
  };

  const movePan = (event: PointerEvent) => {
    if (!panState || event.pointerId !== panState.pointerId) return;
    const area = event.currentTarget as HTMLElement;
    area.scrollLeft = panState.scrollLeft - (event.clientX - panState.x);
    area.scrollTop = panState.scrollTop - (event.clientY - panState.y);
  };

  const endPan = (event: PointerEvent) => {
    if (!panState || event.pointerId !== panState.pointerId) return;
    panState = null;
    if (canvas) canvas.selection = true;
  };

  let gridSnap = $state(false);
  const toggleGridSnap = () => {
    gridSnap = !gridSnap;
    canvas?.setGridEnabled(gridSnap);
    canvas?.setGridSnap(gridSnap);
    refreshCanvas();
  };
  const toggleSafeArea = () => {
    safeAreaVisible = !safeAreaVisible;
    canvas?.setSafeAreaVisible(safeAreaVisible);
  };
  const toggleSmartSnap = () => {
    smartSnap = !smartSnap;
    canvas?.setSmartSnap(smartSnap);
  };
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} onbeforeunload={flushAutosave} />

<div class="app">
  <header class="topbar">
    <div class="logo">LabelDesk<i></i></div>
    <button class="menu-btn" onclick={() => (libraryOpen = true)}>Library</button>
    <button class="menu-btn" class:active={batchEnabled} onclick={() => (dataDialogOpen = true)}>
      Data{batchEnabled ? ` (${batchRowCount})` : ""}
    </button>
    <button class="menu-btn" class:warning={missingFontFamilies.length > 0} onclick={() => (fontsDialogOpen = true)}>
      Fonts{missingFontFamilies.length > 0 ? ` (${missingFontFamilies.length} missing)` : ""}
    </button>
    <button class="menu-btn" class:active={layersOpen} onclick={() => (layersOpen = !layersOpen)}>Layers</button>
    <button class="menu-btn shortcuts-btn" title="Keyboard shortcuts" onclick={() => (shortcutsOpen = true)}>?</button>
    <button class="menu-btn" title="About LabelDesk" onclick={() => (aboutOpen = true)}>About</button>
    <div class="undo-cluster">
      <button class="icon-btn" title="Undo (Ctrl+Z)" disabled={undoDisabled} onclick={undo} aria-label="Undo">
        ↺
      </button>
      <button class="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={redoDisabled} onclick={redo} aria-label="Redo">
        ↻
      </button>
    </div>
    <div class="doc-chip">
      <span class:dirty>{documentTitle}{dirty ? " *" : ""}</span>
      <span class="doc-dims">
        · {(labelProps.size.width / DPMM).toFixed(1)} × {(labelProps.size.height / DPMM).toFixed(1)} mm · 203 dpi
      </span>
    </div>
    <button
      class="chip"
      class:connected={$connectionState === "connected"}
      class:connecting={$connectionState === "connecting"}
      onclick={onConnectClick}
    >
      <span class="dot"></span>
      {#if $connectionState === "connected"}
        {$printerName}
        {#if $heartbeat?.chargeLevel != null}
          <span class="batt">{$heartbeat.chargeLevel * 25}%</span>
        {/if}
      {:else if $connectionState === "connecting"}
        Connecting…
      {:else}
        Connect printer
      {/if}
    </button>
    <button class="btn-print" onclick={() => (printDialogOpen = true)}>Print</button>
  </header>

  <PrintDialog
    bind:open={printDialogOpen}
    {getCanvasJson}
    {labelProps}
    dpmm={DPMM}
    {batchEnabled}
    csvText={$csvData.data}
    {missingFontFamilies}
  />
  <DataDialog
    bind:open={dataDialogOpen}
    bind:enabled={batchEnabled}
    revision={rev}
    {getCanvasJson}
    onAddPlaceholder={addPlaceholder}
    onChanged={documentChanged}
  />
  <FontsDialog
    bind:open={fontsDialogOpen}
    usedFamilies={usedFontFamilies}
    missingFamilies={missingFontFamilies}
  />
  <LibraryDialog
    bind:open={libraryOpen}
    batchAvailable={batchEnabled}
    currentTitle={documentTitle}
    {embeddableFontCount}
    onSave={saveLabelToLibrary}
    onLoad={loadTemplate}
    onExport={exportLabelJson}
    onExportPng={exportLabelPng}
    onImport={importLabelJson}
  />
  <ShortcutsDialog open={shortcutsOpen} onClose={() => (shortcutsOpen = false)} />
  <AboutDialog open={aboutOpen} onClose={() => (aboutOpen = false)} />
  <CanvasContextMenu
    open={contextMenu.open}
    x={contextMenu.x}
    y={contextMenu.y}
    hasSelection={Boolean(selection)}
    canPaste={clipboardAvailable}
    canGroup={selection instanceof fabric.ActiveSelection}
    canUngroup={selection instanceof fabric.Group && !(selection instanceof fabric.ActiveSelection)}
    onClose={() => (contextMenu.open = false)}
    onCopy={copySelection}
    onCut={() => void cutSelection()}
    onPaste={() => void pasteSelection()}
    onDuplicate={() => void duplicateSelection()}
    onDelete={deleteSelection}
    onGroup={groupSelection}
    onUngroup={ungroupSelection}
    onFront={() => arrangeSelection("front")}
    onBack={() => arrangeSelection("back")}
    onLock={lockSelection}
    onHide={hideSelection}
    onShortcuts={() => (shortcutsOpen = true)}
  />

  <div class="main">
    <ToolRail onAdd={addObject} />

    <main
      class="canvas-area"
      class:panning={panState !== null}
      bind:this={canvasAreaEl}
      oncontextmenucapture={openCanvasContextMenu}
      onpointerdowncapture={startPan}
      onpointermove={movePan}
      onpointerup={endPan}
      onpointercancel={endPan}
    >
      <div class="canvas-stage">
        <div class="canvas-holder">
          <canvas bind:this={canvasEl}></canvas>
        </div>
      </div>
      <div class="zoom-cluster">
        <button onclick={zoomOut}>−</button>
        <span class="z">{zoomPercent}%</span>
        <button onclick={zoomIn}>+</button>
        <button class="zoom-text" onclick={zoomToFit} title="Zoom to fit (Ctrl+0)">Fit</button>
        <button class="zoom-text" onclick={() => canvas?.resetVirtualZoom()} title="Actual size (Ctrl+1)">100%</button>
      </div>
    </main>

    {#if layersOpen}
      <LayersPanel {canvas} revision={rev} {selection} onChanged={onPropChanged} onSelected={selectFromLayers} />
    {/if}

    <PropsPanel
      {selection}
      {rev}
      {labelProps}
      safeAreaBounds={canvas?.getSafeAreaBounds()}
      dpmm={DPMM}
      customFontFamilies={$userFonts.map((font) => font.family)}
      {missingFontFamilies}
      onChanged={onPropChanged}
      onDelete={deleteSelection}
      onGroup={groupSelection}
      onUngroup={ungroupSelection}
      onReplaceImage={replaceImage}
      onLabelSize={applyLabelSize}
      onLabelProps={updateLabelProps}
    />
  </div>

  <footer class="status">
    <button class="snap-toggle" class:on={gridSnap} onclick={toggleGridSnap}>
      GRID 5 PX · SNAP {gridSnap ? "ON" : "OFF"}
    </button>
    <button class="snap-toggle" class:on={safeAreaVisible} onclick={toggleSafeArea}>SAFE AREA {safeAreaVisible ? "ON" : "OFF"}</button>
    <button class="snap-toggle" class:on={smartSnap} onclick={toggleSmartSnap}>SMART SNAP {smartSnap ? "ON" : "OFF"}</button>
    <span class="autosave" class:error={autosaveState === "error"}>
      {autosaveState === "saving"
        ? "RECOVERY SAVING"
        : autosaveState === "saved"
          ? "RECOVERY SAVED"
          : autosaveState === "error"
            ? "RECOVERY FAILED"
            : "RECOVERY IDLE"}
    </span>
    <span class="right">NO PRINTER · 203 DPI</span>
  </footer>
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    height: 52px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    background: var(--paper);
    border-bottom: 1.5px solid var(--ink);
  }

  .shortcuts-btn {
    width: 30px;
    padding-inline: 0;
    font-family: var(--font-mono);
  }

  .logo {
    font-family: var(--font-display);
    font-size: 17px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    display: flex;
    align-items: center;
  }

  .logo i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--red);
    display: inline-block;
    margin-left: 4px;
  }

  .menu-btn {
    border: 0;
    background: transparent;
    font-family: var(--font-ui);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink-2);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
  }

  .menu-btn:hover {
    background: var(--paper-2);
    color: var(--ink);
  }

  .menu-btn.active {
    color: var(--amber);
    background: rgba(199, 125, 10, 0.09);
    font-weight: 600;
  }

  .menu-btn.warning {
    color: var(--red-2);
    background: rgba(190, 58, 45, 0.08);
    font-weight: 600;
  }

  .undo-cluster {
    display: flex;
    gap: 2px;
  }

  .icon-btn {
    border: 1px solid var(--line-2);
    background: var(--raised);
    color: var(--ink-2);
    width: 30px;
    height: 28px;
    border-radius: var(--r-s);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--paper-2);
    color: var(--ink);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .doc-chip {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--ink-2);
    border: 1px solid var(--line-2);
    border-radius: var(--r-s);
    padding: 6px 12px;
    background: var(--raised);
  }

  .doc-chip .dirty {
    color: var(--red-2);
    font-weight: 600;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border: 1.5px solid var(--line-2);
    border-radius: 20px;
    background: var(--raised);
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-ui);
    color: var(--ink);
    cursor: pointer;
  }

  .chip .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink-3);
  }

  .chip.connecting .dot {
    background: var(--blue);
    animation: pulse 1s infinite;
  }

  .chip.connected {
    border-color: var(--green);
  }

  .chip.connected .dot {
    background: var(--green);
    box-shadow: 0 0 0 3px rgba(46, 125, 79, 0.18);
  }

  .chip .batt {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--ink-3);
    border-left: 1px solid var(--line);
    padding-left: 8px;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }


  .btn-print {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 9px 20px;
    border-radius: var(--r-s);
    cursor: pointer;
    border: 1.5px solid var(--red-2);
    background: var(--red);
    color: #fff8f0;
    box-shadow: var(--shadow);
  }

  .btn-print:disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  .main {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .canvas-area {
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: auto;
    background-color: var(--paper-2);
    background-image: radial-gradient(circle, #cbc4b2 1px, transparent 1.2px);
    background-size: 18px 18px;
  }

  .canvas-stage {
    width: max-content;
    height: max-content;
    min-width: 100%;
    min-height: 100%;
    box-sizing: border-box;
    padding: 48px;
    display: grid;
    place-items: center;
  }

  .canvas-holder {
    box-shadow: var(--shadow-lg);
  }

  .canvas-area.panning,
  .canvas-area.panning :global(canvas) {
    cursor: grabbing !important;
  }

  .zoom-cluster {
    position: absolute;
    left: 16px;
    bottom: 16px;
    display: flex;
    background: var(--raised);
    border: 1.5px solid var(--ink);
    border-radius: 5px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .zoom-cluster button {
    border: 0;
    background: transparent;
    width: 34px;
    height: 32px;
    cursor: pointer;
    color: var(--ink-2);
    font-size: 15px;
    border-right: 1px solid var(--line);
  }

  .zoom-cluster button:last-child {
    border-right: 0;
  }

  .zoom-cluster button.zoom-text {
    width: 43px;
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .zoom-cluster button:hover {
    background: var(--paper-2);
    color: var(--ink);
  }

  .zoom-cluster .z {
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 500;
    width: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status {
    height: 26px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 0 14px;
    background: var(--paper);
    border-top: 1px solid var(--line-2);
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--ink-3);
  }

  .status .right {
    margin-left: auto;
  }

  .autosave.error {
    color: var(--red-2);
    font-weight: 600;
  }

  .snap-toggle {
    border: 0;
    background: transparent;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--ink-3);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.3px;
  }

  .snap-toggle:hover {
    background: var(--paper-2);
    color: var(--ink-2);
  }

  .snap-toggle.on {
    color: var(--green);
    font-weight: 600;
  }

  /* ----- Mobile layout (stacked panels) ----- */
  @media (max-width: 768px) {
    .topbar {
      gap: 4px;
      padding: 0 10px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .topbar::-webkit-scrollbar {
      display: none;
    }

    .topbar > * {
      flex: none;
    }

    .menu-btn {
      padding: 6px 8px;
    }

    /* Keyboard shortcuts are useless on a touch screen. */
    .shortcuts-btn {
      display: none;
    }

    .doc-dims {
      display: none;
    }

    .btn-print {
      padding: 8px 14px;
      letter-spacing: 0.5px;
    }

    .main {
      flex-direction: column;
    }

    .canvas-area {
      order: 1;
      min-height: 0;
    }

    .canvas-stage {
      padding: 16px;
    }

    .zoom-cluster {
      left: 10px;
      bottom: 10px;
    }

    .status {
      gap: 12px;
      padding: 0 10px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .status::-webkit-scrollbar {
      display: none;
    }

    .status > * {
      flex: none;
      white-space: nowrap;
    }
  }
</style>
