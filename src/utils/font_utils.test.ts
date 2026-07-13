import { describe, expect, it } from "vitest";
import type { FabricJson, UserFont } from "$/types";
import { ExportedLabelTemplateSchema } from "$/types";
import {
  fontFamiliesUsedByCanvas,
  fontFamilyFromFilename,
  fontsUsedByCanvas,
  mergeUserFonts,
  missingFontFamilies,
  validateCustomFontFamily,
} from "$/utils/font_utils";

const font = (family: string): UserFont => ({ family, mimeType: "font/ttf", gzippedDataB64: "data" });
const canvas: FabricJson = {
  version: "7.0.0",
  objects: [
    { type: "Textbox", fontFamily: "Custom Sans" },
    { type: "Group", objects: [{ type: "Barcode", fontFamily: "Nested Mono" }] },
    { type: "Textbox", styles: [{ fontFamily: "Styled Serif" }] },
  ] as never[],
};

describe("custom font helpers", () => {
  it("discovers font families recursively, including text styles", () => {
    expect(fontFamiliesUsedByCanvas(canvas)).toEqual(["Custom Sans", "Nested Mono", "Styled Serif"]);
  });

  it("selects only custom fonts referenced by the canvas", () => {
    expect(fontsUsedByCanvas(canvas, [font("Unused"), font("custom sans")])).toEqual([font("custom sans")]);
  });

  it("reports fonts unavailable from built-ins or the loaded custom list", () => {
    expect(missingFontFamilies(canvas, ["Custom Sans", "Nested Mono"])).toEqual(["Styled Serif"]);
  });

  it("lets embedded fonts replace a local family with the same name", () => {
    const embeddedLocal = { ...font("local"), gzippedDataB64: "embedded" };
    expect(mergeUserFonts([font("Local")], [embeddedLocal, font("Portable")])).toEqual([
      embeddedLocal,
      font("Portable"),
    ]);
  });

  it("derives and validates user-facing family names", () => {
    expect(fontFamilyFromFilename("My.Font.woff2")).toBe("My.Font");
    expect(validateCustomFontFamily("  Workshop Sans  ")).toBe("Workshop Sans");
    expect(() => validateCustomFontFamily("Arial")).toThrow(/built-in/);
  });

  it("accepts embedded fonts in portable templates", () => {
    const parsed = ExportedLabelTemplateSchema.parse({
      canvas: { version: "7.0.0", objects: [] },
      label: { printDirection: "left", size: { width: 240, height: 96 } },
      fonts: [font("Portable")],
    });

    expect(parsed.fonts?.[0].family).toBe("Portable");
  });
});
