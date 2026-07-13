import { LabelType, printTaskNames } from "@mmote/niimbluelib";
import * as fabric from "fabric";
import { z } from "zod";
import {
  MAX_CANVAS_OBJECTS,
  MAX_COMPRESSED_FONT_BYTES,
  MAX_CSV_TEXT_CHARS,
  MAX_EMBEDDED_FONT_TOTAL_CHARS,
  MAX_LABEL_DIMENSION,
  MAX_THUMBNAIL_CHARS,
  MAX_USER_FONTS,
  fabricCanvasValidationError,
  fabricObjectValidationError,
  isEmbeddedRasterDataUrl,
} from "$/utils/import_safety";

export type ConnectionState = "connecting" | "connected" | "disconnected";
export type ConnectionType = "bluetooth" | "serial" | "capacitor-ble";

export type LabelUnit = "mm" | "px";
export type OjectType = "text" | "rectangle" | "line" | "circle" | "image" | "qrcode" | "barcode" | "aruco" | "pdf";
export type PostProcessType = "threshold" | "dither" | "bayer";
export type MoveDirection = "up" | "down" | "left" | "right";
export type LabelShape = "rect" | "rounded_rect" | "circle";
export type LabelSplit = "none" | "vertical" | "horizontal";
export type TailPosition = "right" | "bottom" | "left" | "top";
export type MirrorType = "none" | "copy" | "flip";

export interface BatchRow {
  /** One-based row number in the source CSV, excluding the header. */
  sourceRow: number;
  values: Record<string, string>;
  times: number;
}

export interface BatchParseResult {
  columns: string[];
  rows: BatchRow[];
  errors: string[];
  valid: boolean;
}

export interface BatchPrintRow extends BatchRow {
  quantity: number;
}

type _Range<T extends number, R extends unknown[]> = R["length"] extends T ? R[number] : _Range<T, [R["length"], ...R]>;

export type Range<T extends number> = number extends T ? number : _Range<T, []>;

export const CsvParamsSchema = z.object({
  data: z.string().max(MAX_CSV_TEXT_CHARS),
});

export const FabricObjectSchema = z.custom<fabric.FabricObject>(
  (value) => fabricObjectValidationError(value) === null,
  "Invalid or unsupported Fabric object",
);

export const LabelPropsSchema = z.object({
  printDirection: z.enum(["left", "top"]),
  size: z.object({
    width: z.number().positive().max(MAX_LABEL_DIMENSION),
    height: z.number().positive().max(MAX_LABEL_DIMENSION),
  }),
  shape: z.enum(["rect", "rounded_rect", "circle"]).default("rect").optional(),
  split: z.enum(["none", "vertical", "horizontal"]).default("none").optional(),
  splitParts: z.number().min(1).default(2).optional(),
  tailPos: z.enum(["right", "bottom", "left", "top"]).default("right").optional(),
  tailLength: z.number().default(0).optional(),
  mirror: z.enum(["none", "copy", "flip"]).default("none").optional(),
});

export const LabelPresetSchema = z.object({
  width: z.number().positive().max(MAX_LABEL_DIMENSION),
  height: z.number().positive().max(MAX_LABEL_DIMENSION),
  unit: z.enum(["mm", "px"]),
  dpmm: z.number().positive(),
  printDirection: z.enum(["left", "top"]),
  title: z.string().optional(),
  shape: z.enum(["rect", "rounded_rect", "circle"]).default("rect").optional(),
  split: z.enum(["none", "vertical", "horizontal"]).default("none").optional(),
  splitParts: z.number().min(1).default(2).optional(),
  tailPos: z.enum(["right", "bottom", "left", "top"]).default("right").optional(),
  tailLength: z.number().default(0).optional(),
  mirror: z.enum(["none", "copy", "flip"]).default("none").optional(),
});

export const FabricJsonSchema = z.object({
  version: z.string().min(1).max(32),
  objects: z.array(FabricObjectSchema).max(MAX_CANVAS_OBJECTS),
}).superRefine((value, context) => {
  const error = fabricCanvasValidationError(value.objects);
  if (error) context.addIssue({ code: "custom", message: error, path: ["objects"] });
});

export const UserFontSchema = z.object({
  gzippedDataB64: z.string().min(1).max(Math.ceil((MAX_COMPRESSED_FONT_BYTES * 4) / 3) + 4).regex(/^[a-z0-9+/]+={0,2}$/i),
  family: z.string().trim().min(1).max(80),
  mimeType: z.enum(["font/ttf", "font/otf", "font/woff", "font/woff2"]),
});

export const ExportedLabelTemplateSchema = z.object({
  canvas: FabricJsonSchema,
  label: LabelPropsSchema,
  thumbnailBase64: z.string().max(MAX_THUMBNAIL_CHARS).refine(isEmbeddedRasterDataUrl, "Invalid thumbnail data").optional(),
  title: z.string().max(200).optional(),
  timestamp: z.number().positive().optional(),
  id: z.string().optional(), // filled with localStorage key, not exported
  csv: CsvParamsSchema.optional(),
  fonts: z.array(UserFontSchema).max(MAX_USER_FONTS).optional(),
}).superRefine((value, context) => {
  const totalFontChars = value.fonts?.reduce((total, font) => total + font.gzippedDataB64.length, 0) ?? 0;
  if (totalFontChars > MAX_EMBEDDED_FONT_TOTAL_CHARS) {
    context.addIssue({ code: "custom", message: "Embedded font data is too large.", path: ["fonts"] });
  }
});

export const EditorSessionSchema = z.object({
  version: z.literal(1),
  canvas: FabricJsonSchema,
  label: LabelPropsSchema,
  title: z.string().max(200),
  batchEnabled: z.boolean(),
  csv: CsvParamsSchema.optional(),
  dirty: z.boolean(),
});

const [firstTask, ...otherTasks] = printTaskNames;

export const PreviewPropsOffsetSchema = z.object({
  x: z.number(),
  y: z.number(),
  offsetType: z.enum(["inner", "outer"]),
});

export const PreviewPropsSchema = z.object({
  postProcess: z.enum(["threshold", "dither", "bayer"]).optional(),
  postProcessInvert: z.boolean().optional(),
  threshold: z.number().gte(1).lte(255).optional(),
  quantity: z.number().gte(1).optional(),
  density: z.number().gte(1).optional(),
  speed: z.union([z.literal(0), z.literal(1)]).optional(),
  labelType: z.enum(LabelType).optional(),
  printTaskName: z.enum([firstTask, ...otherTasks]).optional(),
  offset: PreviewPropsOffsetSchema.optional(),
});

export const AutomationPropsSchema = z.object({
  /** Request device connect on page load. Works only for Capacitor BLE connection. */
  autoConnect: z.boolean().optional(),
  /** Connect to MAC or device id. Works only for Capacitor BLE connection. */
  autoConnectDeviceId: z.string().optional(),
  /** immediately - just open print preview dialog */
  startPrint: z.enum(["after_connect", "immediately"]).optional(),
});

export const AppConfigSchema = z.object({
  /** Keep image aspect ration when using "fit" button */
  fitMode: z.enum(["stretch", "ratio_min", "ratio_max"]),
  pageDelay: z.number().gte(0).optional(),
  iconListMode: z.enum(["user", "pack", "both"]),
  packetIntervalMs: z.number().gte(0).optional(),
  gridEnabled: z.boolean().optional(),
});

export const UserIconSchema = z.object({
  name: z.string(),
  data: z.string(),
});

export type CsvParams = z.infer<typeof CsvParamsSchema>;
export type UserIcon = z.infer<typeof UserIconSchema>;
export type LabelProps = z.infer<typeof LabelPropsSchema>;
export type LabelPreset = z.infer<typeof LabelPresetSchema>;
export type FabricJson = z.infer<typeof FabricJsonSchema>;
export type ExportedLabelTemplate = z.infer<typeof ExportedLabelTemplateSchema>;
export type EditorSession = z.infer<typeof EditorSessionSchema>;
export type PreviewPropsOffset = z.infer<typeof PreviewPropsOffsetSchema>;
export type PreviewProps = z.infer<typeof PreviewPropsSchema>;
export type AutomationProps = z.infer<typeof AutomationPropsSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type UserFont = z.infer<typeof UserFontSchema>;
