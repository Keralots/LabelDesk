import { FONT_FAMILIES } from "$/defaults";
import type { FabricJson, UserFont } from "$/types";
import { fontLoadErrors, loadedFontFamilies, loadedFonts } from "$/stores";
import { base64ToBytes, bufferToBase64, compressBuffer, decompressBuffer } from "$/utils/binary_utils";
import {
  MAX_COMPRESSED_FONT_BYTES,
  MAX_FONT_FILE_BYTES,
  MAX_USER_FONTS,
} from "$/utils/import_safety";

export { MAX_COMPRESSED_FONT_BYTES, MAX_FONT_FILE_BYTES } from "$/utils/import_safety";

export const FONT_FILE_ACCEPT = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";
const MIME_BY_EXTENSION: Record<string, UserFont["mimeType"]> = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

const familyKey = (family: string) => family.trim().toLocaleLowerCase();
const builtinFamilyKeys = new Set(FONT_FAMILIES.map((font) => familyKey(font.value)));

export const fontFamilyFromFilename = (filename: string): string =>
  filename.replace(/\.[^.]+$/, "").trim();

export const validateCustomFontFamily = (family: string): string => {
  const value = family.trim();
  if (!value) throw new Error("Enter a font family name.");
  if (value.length > 80) throw new Error("Font family names are limited to 80 characters.");
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error("Font family name contains control characters.");
  if (builtinFamilyKeys.has(familyKey(value))) throw new Error(`${value} is already a built-in font.`);
  return value;
};

const visitFontFamilies = (value: unknown, result: Set<string>): void => {
  if (Array.isArray(value)) {
    value.forEach((entry) => visitFontFamilies(entry, result));
    return;
  }
  if (value === null || typeof value !== "object") return;

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (key === "fontFamily" && typeof child === "string" && child.trim()) result.add(child.trim());
    else visitFontFamilies(child, result);
  });
};

export const fontFamiliesUsedByCanvas = (canvas: FabricJson): string[] => {
  const result = new Set<string>();
  visitFontFamilies(canvas.objects, result);
  return [...result].sort((a, b) => a.localeCompare(b));
};

export const fontsUsedByCanvas = (canvas: FabricJson, fonts: UserFont[]): UserFont[] => {
  const used = new Set(fontFamiliesUsedByCanvas(canvas).map(familyKey));
  return fonts.filter((font) => used.has(familyKey(font.family)));
};

export const missingFontFamilies = (canvas: FabricJson, availableCustomFamilies: string[]): string[] => {
  const available = new Set([...builtinFamilyKeys, ...availableCustomFamilies.map(familyKey)]);
  return fontFamiliesUsedByCanvas(canvas).filter((family) => !available.has(familyKey(family)));
};

export const mergeUserFonts = (current: UserFont[], incoming: UserFont[]): UserFont[] => {
  const replacements = new Map(incoming.map((font) => [familyKey(font.family), font]));
  const result = current.map((font) => replacements.get(familyKey(font.family)) ?? font);
  const known = new Set(result.map((font) => familyKey(font.family)));
  incoming.forEach((font) => {
    const key = familyKey(font.family);
    if (!known.has(key)) {
      result.push(font);
      known.add(key);
    }
  });
  if (result.length > MAX_USER_FONTS) {
    throw new Error(`A browser profile can store at most ${MAX_USER_FONTS} custom fonts.`);
  }
  return result;
};

export const createUserFont = async (file: File, familyOverride = ""): Promise<UserFont> => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error("Choose a TTF, OTF, WOFF, or WOFF2 font file.");
  if (file.size > MAX_FONT_FILE_BYTES) throw new Error("Font file is larger than 4 MB.");

  const family = validateCustomFontFamily(familyOverride || fontFamilyFromFilename(file.name));
  const data = await file.arrayBuffer();
  try {
    await new FontFace(family, data).load();
  } catch {
    throw new Error("The browser could not load this font file.");
  }

  const compressed = await compressBuffer(data);
  if (compressed.byteLength > MAX_COMPRESSED_FONT_BYTES) {
    throw new Error("Compressed font is too large for local browser storage.");
  }

  return {
    family,
    mimeType,
    gzippedDataB64: await bufferToBase64(compressed),
  };
};

type LoadedFontRecord = { face: FontFace; data: string };
const activeFonts = new Map<string, LoadedFontRecord>();
let syncQueue: Promise<void> = Promise.resolve();

const performFontSync = async (fonts: UserFont[]): Promise<void> => {
  const desired = new Map(fonts.map((font) => [familyKey(font.family), font]));
  activeFonts.forEach((record, key) => {
    const replacement = desired.get(key);
    if (!replacement || replacement.gzippedDataB64 !== record.data) {
      document.fonts.delete(record.face);
      activeFonts.delete(key);
    }
  });

  const errors: string[] = [];
  for (const font of fonts) {
    const key = familyKey(font.family);
    if (activeFonts.has(key)) continue;
    try {
      const bytes = base64ToBytes(font.gzippedDataB64);
      if (bytes.byteLength > MAX_COMPRESSED_FONT_BYTES) throw new Error("Compressed font data is too large.");
      const data = await decompressBuffer(bytes, MAX_FONT_FILE_BYTES);
      const face = await new FontFace(font.family, data).load();
      document.fonts.add(face);
      activeFonts.set(key, { face, data: font.gzippedDataB64 });
    } catch (error) {
      console.error(`Failed to load font ${font.family}:`, error);
      errors.push(font.family);
    }
  }

  const faces = [...activeFonts.values()].map((record) => record.face);
  loadedFonts.set(faces);
  loadedFontFamilies.set(faces.map((face) => face.family));
  fontLoadErrors.set(errors);
};

export const syncUserFonts = (fonts: UserFont[]): Promise<void> => {
  const snapshot = fonts.map((font) => ({ ...font }));
  syncQueue = syncQueue.then(
    () => performFontSync(snapshot),
    () => performFontSync(snapshot),
  );
  return syncQueue;
};
