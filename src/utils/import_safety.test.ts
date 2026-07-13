import { describe, expect, it } from "vitest";
import { CsvParamsSchema, ExportedLabelTemplateSchema, FabricJsonSchema, LabelPropsSchema } from "$/types";
import {
  MAX_CANVAS_OBJECTS,
  MAX_CSV_TEXT_CHARS,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FILE_BYTES,
  assertFileSize,
  assertImageDimensions,
} from "$/utils/import_safety";

const baseTemplate = {
  canvas: { version: "7.4.0", objects: [] },
  label: { printDirection: "left" as const, size: { width: 240, height: 96 } },
};

describe("template import safety", () => {
  it("accepts supported objects and embedded raster images", () => {
    const parsed = ExportedLabelTemplateSchema.parse({
      ...baseTemplate,
      canvas: {
        version: "7.4.0",
        objects: [
          { type: "Textbox", text: "Hello", name: undefined },
          {
            type: "Group",
            objects: [{ type: "Image", src: "data:image/png;base64,AA==" }],
          },
        ],
      },
    });

    expect(parsed.canvas.objects).toHaveLength(2);
  });

  it("rejects remote images, including images nested in groups", () => {
    expect(() =>
      FabricJsonSchema.parse({
        version: "7.4.0",
        objects: [{ type: "Group", objects: [{ type: "Image", src: "https://tracker.example/pixel.png" }] }],
      }),
    ).toThrow();
  });

  it("rejects unsupported Fabric types and prototype-related keys", () => {
    expect(() => FabricJsonSchema.parse({ version: "7.4.0", objects: [{ type: "Path", path: [] }] })).toThrow();

    const polluted = JSON.parse('{"version":"7.4.0","objects":[{"type":"Rect","__proto__":{"admin":true}}]}');
    expect(() => FabricJsonSchema.parse(polluted)).toThrow();
  });

  it("limits canvas complexity, CSV length, and label dimensions", () => {
    const objects = Array.from({ length: MAX_CANVAS_OBJECTS + 1 }, () => ({ type: "Rect" }));
    expect(() => FabricJsonSchema.parse({ version: "7.4.0", objects })).toThrow();
    expect(() => CsvParamsSchema.parse({ data: "x".repeat(MAX_CSV_TEXT_CHARS + 1) })).toThrow();
    expect(() =>
      LabelPropsSchema.parse({
        printDirection: "left",
        size: { width: 240, height: MAX_IMAGE_DIMENSION + 1 },
      }),
    ).toThrow();
  });

  it("limits the total embedded font payload", () => {
    const encodedFont = "AAAA".repeat(400_000);
    const fonts = Array.from({ length: 6 }, (_, index) => ({
      family: `Portable ${index}`,
      mimeType: "font/ttf" as const,
      gzippedDataB64: encodedFont,
    }));

    expect(() => ExportedLabelTemplateSchema.parse({ ...baseTemplate, fonts })).toThrow(/font data/i);
  });
});

describe("local file limits", () => {
  it("rejects oversized files before reading them", () => {
    expect(() =>
      assertFileSize({ name: "huge.png", size: MAX_IMAGE_FILE_BYTES + 1 }, MAX_IMAGE_FILE_BYTES, "Image"),
    ).toThrow(/larger than 10 MB/);
  });

  it("rejects excessive decoded image dimensions", () => {
    expect(() => assertImageDimensions(MAX_IMAGE_DIMENSION + 1, 10)).toThrow(/limited/);
    expect(() => assertImageDimensions(10_000, 10_000)).toThrow(/limited/);
    expect(() => assertImageDimensions(0, 100)).toThrow(/invalid/);
  });
});
