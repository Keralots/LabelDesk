export const MAX_TEMPLATE_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_TEMPLATE_DECOMPRESSED_BYTES = 16 * 1024 * 1024;
export const MAX_TEMPLATE_COMPRESSED_BYTES = 4 * 1024 * 1024;
export const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_TEXT_CHARS = 5 * 1024 * 1024;
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 16_384;
export const MAX_IMAGE_PIXELS = 50_000_000;
export const MAX_LABEL_DIMENSION = 16_384;
export const MAX_CANVAS_OBJECTS = 1_000;
export const MAX_FABRIC_NESTING = 20;
export const MAX_FABRIC_STRING_CHARS = 14 * 1024 * 1024;
export const MAX_THUMBNAIL_CHARS = 2 * 1024 * 1024;
export const MAX_FONT_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_COMPRESSED_FONT_BYTES = 1_500_000;
export const MAX_EMBEDDED_FONT_TOTAL_CHARS = 8 * 1024 * 1024;
export const MAX_USER_FONTS = 16;

const ALLOWED_FABRIC_OBJECT_TYPES = new Set([
  "Textbox",
  "textbox",
  "Rect",
  "rect",
  "Circle",
  "circle",
  "Polyline",
  "polyline",
  "Line",
  "line",
  "Image",
  "image",
  "Group",
  "group",
  "Barcode",
  "QRCode",
  "ArUcoMarker",
]);

const IMAGE_OBJECT_TYPES = new Set(["Image", "image"]);
const GROUP_OBJECT_TYPES = new Set(["Group", "group"]);
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const EMBEDDED_RASTER_PATTERN = /^data:image\/(?:png|jpeg|gif|bmp|webp);base64,[a-z0-9+/]+={0,2}$/i;

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

interface FabricScanState {
  objectCount: number;
}

const scanValue = (
  value: unknown,
  depth: number,
  state: FabricScanState,
  expectFabricObject: boolean,
): string | null => {
  if (depth > MAX_FABRIC_NESTING) return `Fabric data is nested more than ${MAX_FABRIC_NESTING} levels.`;
  if (typeof value === "string") {
    return value.length <= MAX_FABRIC_STRING_CHARS ? null : "Fabric data contains an oversized string.";
  }
  if (typeof value === "number") return Number.isFinite(value) ? null : "Fabric data contains a non-finite number.";
  // Fabric's live toObject() result may include optional undefined values;
  // JSON serialization drops them before persistence or export.
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const error = scanValue(child, depth + 1, state, false);
      if (error) return error;
    }
    return null;
  }
  if (!isRecord(value)) return "Fabric data contains an unsupported value.";

  let objectType: string | null = null;
  if (expectFabricObject) {
    objectType = typeof value.type === "string" ? value.type : null;
    if (!objectType || !ALLOWED_FABRIC_OBJECT_TYPES.has(objectType)) {
      return `Unsupported Fabric object type: ${objectType ?? "missing"}.`;
    }
    state.objectCount++;
    if (state.objectCount > MAX_CANVAS_OBJECTS) {
      return `A label can contain at most ${MAX_CANVAS_OBJECTS} objects.`;
    }
    if (IMAGE_OBJECT_TYPES.has(objectType)) {
      if (typeof value.src !== "string" || !EMBEDDED_RASTER_PATTERN.test(value.src)) {
        return "Images in templates must be embedded PNG, JPEG, GIF, BMP, or WebP data.";
      }
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED_KEYS.has(key)) return `Fabric data contains the blocked key "${key}".`;

    const nestedFabricObjects = expectFabricObject && key === "objects" && GROUP_OBJECT_TYPES.has(objectType ?? "");
    if (nestedFabricObjects) {
      if (!Array.isArray(child)) return "A Fabric group must contain an object array.";
      for (const nested of child) {
        const error = scanValue(nested, depth + 1, state, true);
        if (error) return error;
      }
      continue;
    }

    const error = scanValue(child, depth + 1, state, expectFabricObject && key === "clipPath");
    if (error) return error;
  }

  return null;
};

export const fabricObjectValidationError = (value: unknown): string | null =>
  scanValue(value, 0, { objectCount: 0 }, true);

export const fabricCanvasValidationError = (objects: unknown[]): string | null => {
  const state: FabricScanState = { objectCount: 0 };
  for (const object of objects) {
    const error = scanValue(object, 0, state, true);
    if (error) return error;
  }
  return null;
};

export const isEmbeddedRasterDataUrl = (value: string): boolean => EMBEDDED_RASTER_PATTERN.test(value);

export const assertFileSize = (file: Pick<File, "name" | "size">, maximumBytes: number, label: string): void => {
  if (file.size > maximumBytes) {
    const maximumMb = Math.floor(maximumBytes / (1024 * 1024));
    throw new Error(`${label} "${file.name}" is larger than ${maximumMb} MB.`);
  }
};

export const assertImageDimensions = (width: number, height: number): void => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("The image has invalid dimensions.");
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error(
      `Images are limited to ${MAX_IMAGE_DIMENSION} pixels per side and ${MAX_IMAGE_PIXELS.toLocaleString()} total pixels.`,
    );
  }
};

export const textFileLimit = (extension: string): number => {
  switch (extension.toLowerCase().replace(/^\./, "")) {
    case "csv":
      return MAX_CSV_FILE_BYTES;
    case "json":
      return MAX_TEMPLATE_FILE_BYTES;
    default:
      return MAX_TEMPLATE_FILE_BYTES;
  }
};
