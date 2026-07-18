import * as fabric from "fabric";
import {
  ExportedLabelTemplateSchema,
  LabelPresetSchema,
  type ExportedLabelTemplate,
  type FabricJson,
  type LabelPreset,
  type LabelProps,
} from "$/types";
import { OBJECT_DEFAULTS, OBJECT_DEFAULTS_VECTOR, THUMBNAIL_HEIGHT, THUMBNAIL_QUALITY } from "$/defaults";
import { z } from "zod";
import { CustomCanvas } from "$/fabric-object/custom_canvas";
import { CanvasUtils } from "$/utils/canvas_utils";
import { LocalStoragePersistence } from "./persistence";
import { csvData, userFonts } from "$/stores";
import { get } from "svelte/store";
import { fontsUsedByCanvas } from "$/utils/font_utils";
import { base64ToBytes, bufferToBase64, compressBuffer, decompressBuffer } from "$/utils/binary_utils";
import {
  MAX_TEMPLATE_COMPRESSED_BYTES,
  MAX_TEMPLATE_DECOMPRESSED_BYTES,
  MAX_TEMPLATE_FILE_BYTES,
  assertFileSize,
  textFileLimit,
} from "$/utils/import_safety";

export class FileUtils {
  static timestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  static timestampFloat(): number {
    return Date.now() / 1000;
  }

  /** Convert string to base64 string */
  static base64str(str: string): string {
    const bytes = new TextEncoder().encode(str);
    const chunkSize = 32_768;
    let binString = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binString += String.fromCodePoint(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binString);
  }

  /** Convert object to base64 string */
  static base64obj(obj: unknown): string {
    const json: string = JSON.stringify(obj);
    return FileUtils.base64str(json);
  }

  /** Convert object to base64 string */
  static base64buf(buf: ArrayBuffer): Promise<string> {
    return bufferToBase64(buf);
  }

  static async decompressData(buf: BufferSource, maximumOutputBytes?: number): Promise<ArrayBuffer> {
    return decompressBuffer(buf, maximumOutputBytes);
  }

  static async compressData(buf: BufferSource): Promise<ArrayBuffer> {
    return compressBuffer(buf);
  }

  /** Convert base64 string to bytes */
  static base64toBytes(b64str: string): Uint8Array<ArrayBuffer> {
    return base64ToBytes(b64str);
  }

  static async blobToDataUrl(file: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (readerEvt: ProgressEvent<FileReader>) => {
        if (readerEvt?.target?.result) {
          resolve(readerEvt.target.result as string);
        }
      };
      reader.onerror = (readerEvt: ProgressEvent<FileReader>) => {
        console.error(readerEvt);
        reject(new Error("File read error"));
      };
    });
  }

  static async downloadBase64Web(filename: string, mime: string, base64Data: string) {
    const byteChars = atob(base64Data);
    const byteNumbers = new Array(byteChars.length);

    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }

    const arr = new Uint8Array(byteNumbers);
    const blob = new Blob([arr], { type: mime });

    const a = document.createElement("a");
    a.download = filename;
    a.href = URL.createObjectURL(blob);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 10_000);
  }

  static async downloadBase64(filename: string, mime: string, base64Data: string) {
    FileUtils.downloadBase64Web(filename, mime, base64Data);
  }

  static makeExportedLabel(
    canvas: CustomCanvas,
    labelProps: LabelProps,
    includeCsv: boolean,
    includeFonts = false,
  ): ExportedLabelTemplate {
    const crop = canvas.getLabelCrop();
    const thumbnailBase64: string = canvas.toDataURL({
      ...crop,
      multiplier: THUMBNAIL_HEIGHT / (crop.height || 1),
      quality: THUMBNAIL_QUALITY,
      format: "jpeg",
    });

    const canvasJson = CanvasUtils.serializeCanvas(canvas);
    const tpl: ExportedLabelTemplate = {
      canvas: canvasJson,
      label: labelProps,
      thumbnailBase64,
      timestamp: FileUtils.timestamp(),
    };

    if (includeCsv) {
      tpl.csv = get(csvData);
    }

    if (includeFonts) {
      const fonts = fontsUsedByCanvas(canvasJson, get(userFonts));
      if (fonts.length > 0) tpl.fonts = fonts;
    }

    tpl.id = LocalStoragePersistence.createUidForLabel(tpl);

    return tpl;
  }

  /** Convert label template to JSON and download it */
  static saveLabelAsJson(label: ExportedLabelTemplate) {
    const parsed = ExportedLabelTemplateSchema.omit({ id: true }).parse(label);
    const timestamp = label.timestamp ?? FileUtils.timestamp();
    let filename = `label_${timestamp}.json`;

    if (parsed.title && parsed.title.trim().length > 0) {
      filename = `${parsed.title}.json`;
    }

    FileUtils.downloadBase64(filename, "application/json", FileUtils.base64obj(parsed));
  }

  /** Convert canvas to PNG and download it */
  static saveCanvasAsPng(canvas: CustomCanvas, title?: string) {
    const timestamp = FileUtils.timestamp();

    const url = canvas.toDataURL({
      ...canvas.getLabelCrop(),
      format: "png",
      multiplier: 1,
    });

    const filename = title && title !== "Untitled" ? `${title}.png` : `label_${timestamp}.png`;
    FileUtils.downloadBase64(filename, "image/png", url.split("base64,")[1]);
  }

  /** Convert label template to JSON and download it */
  static saveLabelPresetsAsJson(presets: LabelPreset[]) {
    const parsed = z.array(LabelPresetSchema).parse(presets);
    FileUtils.downloadBase64(`presets_${FileUtils.timestamp()}.json`, "application/json", FileUtils.base64obj(parsed));
  }

  /**
   * Open file picker and return file contents
   *
   * fixme: never ends if dialog closed
   *
   **/
  static async pickFileAsync(acceptExtension: string, multiple: boolean): Promise<FileList> {
    return new Promise((resolve) => {
      const input: HTMLInputElement = document.createElement("input");

      input.type = "file";
      input.multiple = multiple;

      if (acceptExtension !== "*") {
        // Pass MIME types, comma lists, or explicit ".ext" through verbatim;
        // otherwise treat a bare word as a file extension.
        const looksLikeAcceptValue =
          acceptExtension.includes("/") || acceptExtension.includes(",") || acceptExtension.startsWith(".");
        input.accept = looksLikeAcceptValue ? acceptExtension : `.${acceptExtension}`;
      }

      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.files !== null) resolve(target.files);
      };
      input.oncancel = () => input.files && resolve(input.files);
      input.click();
    });
  }

  static async pickAndReadTextFile(
    acceptExtension: string,
    multiple: boolean,
    maximumBytes = textFileLimit(acceptExtension),
  ): Promise<string[]> {
    const fileList = await FileUtils.pickFileAsync(acceptExtension, multiple);

    const result: string[] = [];

    for (const file of fileList) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === acceptExtension.toLowerCase()) {
        assertFileSize(file, maximumBytes, acceptExtension.toUpperCase());
        const data = await file.text();
        result.push(data);
      } else {
        throw new Error(`Only ${acceptExtension} allowed`);
      }
    }

    return result;
  }

  static async pickAndReadSingleTextFile(acceptExtension: string, maximumBytes?: number): Promise<string> {
    const result = await FileUtils.pickAndReadTextFile(acceptExtension, false, maximumBytes);
    if (result.length === 0) {
      throw new Error("No files processed");
    }
    return result[0];
  }

  /**
   * Open file picker and return file contents
   * */
  static async pickAndReadBinaryFile(
    acceptExtension: string,
    maximumBytes = MAX_TEMPLATE_FILE_BYTES,
  ): Promise<{ name: string; data: ArrayBuffer }> {
    const fileList = await FileUtils.pickFileAsync(acceptExtension, false);
    const file: File = fileList[0];
    const ext = file.name.split(".").pop();

    if (acceptExtension !== "*" && ext !== acceptExtension) {
      throw new Error(`Only ${acceptExtension} allowed`);
    }

    assertFileSize(file, maximumBytes, "File");
    const data: ArrayBuffer = await file.arrayBuffer();
    return { name: file.name, data };
  }

  static async loadCanvasState(canvas: fabric.Canvas, state: FabricJson): Promise<void> {
    const deprecatedLines: fabric.Line[] = [];

    await canvas.loadFromJSON(state, (_, obj) => {
      if (obj instanceof fabric.FabricObject) {
        obj.set({ snapAngle: OBJECT_DEFAULTS.snapAngle });
        CanvasUtils.fixFabricObjectScale(obj);

        if (obj instanceof fabric.Line) {
          deprecatedLines.push(obj);
        }
      }
    });

    // convert deprecated Line to Polyline
    for (const line of deprecatedLines) {
      const poly = new fabric.Polyline(
        [
          { x: line.x1, y: line.y1 },
          { x: line.x2, y: line.y2 },
        ],
        {
          ...OBJECT_DEFAULTS_VECTOR,
          left: line.left,
          top: line.top,
          angle: line.angle,
          scaleX: line.scaleX,
          scaleY: line.scaleY,
          fill: line.fill,
          stroke: line.stroke,
          strokeWidth: line.strokeWidth,
        },
      );

      canvas.remove(line);
      canvas.add(poly);
    }

    if (canvas instanceof CustomCanvas) {
      canvas.virtualZoom(canvas.getVirtualZoom());
    }

    canvas.requestRenderAll();
  }

  static printImageUrls(sources: string[]) {
    const imgs = sources.map((src) => `<img src="${src}"/>`);

    const html = `
    <html>
      <head>
        <style>
          html, body {
            margin: 0;
            padding: 0;
          }
          img {
            display: block;
            width: 100vw;
            height: 100vh;
            image-rendering: pixelated;
            ${imgs.length > 1 ? "page-break-after: always;" : ""}
          }
        </style>
      </head>
      <body>
        ${imgs.join("\n")}
      </body>
    </html>
    `;

    const iframe = document.createElement("iframe");

    iframe.onload = () => {
      const iframeWindow = iframe.contentWindow!;
      iframeWindow.onafterprint = () => iframe.remove();
      iframeWindow.print();
    };

    iframe.style.display = "none";
    iframe.src = "about:blank";
    iframe.srcdoc = html;

    document.body.appendChild(iframe);
  }

  static async makeLabelUrl(label: ExportedLabelTemplate): Promise<string> {
    const labelStr = JSON.stringify({ ...label, thumbnailBase64: undefined });

    const encoder = new TextEncoder();
    const data = encoder.encode(labelStr);

    if (data.length > 2 * 1024 * 1024) {
      throw new Error("Label data size > 2MB");
    }

    const compressed = await FileUtils.compressData(data);
    const b64data = await FileUtils.base64buf(compressed);
    return `${location.protocol}//${location.host}/#load=${b64data}`;
  }

  static urlHashParamsToDict(): Record<string, string> {
    const anchorData = globalThis.location.hash.slice(1);

    if (!anchorData) {
      return {};
    }

    return anchorData.split("&").reduce((res: Record<string, string>, item: string) => {
      const firstEqualsIndex = item.indexOf("=");

      if (firstEqualsIndex === -1) {
        // Handle case without value (e.g., "key" without "=value")
        res[item] = "";
      } else {
        const key = item.slice(0, firstEqualsIndex);
        const value = item.slice(firstEqualsIndex + 1);
        res[key] = value;
      }

      return res;
    }, {});
  }

  static async readLabelFromUrl(): Promise<ExportedLabelTemplate | null> {
    const params = FileUtils.urlHashParamsToDict();

    if ("uload" in params) {
      const b64data: string = params["uload"];
      if (b64data.length > Math.ceil((MAX_TEMPLATE_FILE_BYTES * 4) / 3) + 4) {
        throw new Error("Shared label data is too large.");
      }
      const jsonBytes = FileUtils.base64toBytes(b64data);
      const jsonStr = new TextDecoder().decode(jsonBytes);
      const labelObj = JSON.parse(jsonStr);
      return ExportedLabelTemplateSchema.parse(labelObj);
    }

    if (!("load" in params)) {
      return null;
    }

    const b64data: string = params["load"];
    if (b64data.length > Math.ceil((MAX_TEMPLATE_COMPRESSED_BYTES * 4) / 3) + 4) {
      throw new Error("Compressed shared label data is too large.");
    }
    const bytes = FileUtils.base64toBytes(b64data);
    const decompressed = await FileUtils.decompressData(bytes, MAX_TEMPLATE_DECOMPRESSED_BYTES);
    const decoder = new TextDecoder();

    const decoded = decoder.decode(decompressed);
    const labelObj = JSON.parse(decoded);
    return ExportedLabelTemplateSchema.parse(labelObj);
  }

}
