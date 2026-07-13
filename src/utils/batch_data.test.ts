import { describe, expect, it } from "vitest";
import * as fabric from "fabric";
import type { FabricJson } from "$/types";
import {
  buildBatchPrintRows,
  extractCanvasVariableKeys,
  parseBatchCsv,
  totalBatchLabels,
  validateBatchForCanvas,
} from "$/utils/batch_data";
import { canvasPreprocess, preprocessString } from "$/utils/canvas_preprocess";
import { TextboxExt } from "$/fabric-object/textbox-ext";
import QRCode from "$/fabric-object/qrcode";
import Barcode from "$/fabric-object/barcode";

const canvasWithText = (...texts: string[]): FabricJson => ({
  version: "7.0.0",
  objects: texts.map((text) => ({ type: "Textbox", text }) as never),
});

describe("parseBatchCsv", () => {
  it("parses quoted commas, quoted newlines, and escaped newlines", () => {
    const parsed = parseBatchCsv('name,description\n"A, B","first\nsecond"\nC,line\\nwrapped');

    expect(parsed.valid).toBe(true);
    expect(parsed.rows[0].values).toEqual({ name: "A, B", description: "first\nsecond" });
    expect(parsed.rows[1].values.description).toBe("line\nwrapped");
  });

  it("rejects blank and duplicate headers", () => {
    const parsed = parseBatchCsv("name,,name\nA,B,C");

    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toContain("Header 2 is empty.");
    expect(parsed.errors).toContain('Header "name" is duplicated.');
  });

  it("rejects mismatched rows", () => {
    const parsed = parseBatchCsv("a,b\n1\n2,3,4");
    expect(parsed.errors).toEqual([
      "Row 1 has 1 fields; expected 2.",
      "Row 2 has 3 fields; expected 2.",
    ]);
  });

  it("validates $times and accepts zero", () => {
    const valid = parseBatchCsv("name,$times\nA,\nB,0\nC,3");
    expect(valid.rows.map((row) => row.times)).toEqual([1, 0, 3]);
    expect(valid.valid).toBe(true);

    const invalid = parseBatchCsv("name,$times\nA,1.5\nB,-1");
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toHaveLength(2);
  });
});

describe("batch validation and selection", () => {
  it("finds placeholders recursively without changing source JSON", () => {
    const json = canvasWithText("{sku}", "{dt|YYYY}", "https://x/{serial}");
    const before = JSON.stringify(json);

    expect(extractCanvasVariableKeys(json)).toEqual(["sku", "dt", "serial"]);
    expect(JSON.stringify(json)).toBe(before);
  });

  it("blocks missing CSV columns but accepts built-in date variables", () => {
    const parsed = parseBatchCsv("sku\nABC");
    const validated = validateBatchForCanvas(parsed, canvasWithText("{sku} {dt} {serial}"));

    expect(validated.valid).toBe(false);
    expect(validated.errors).toContain("Missing CSV column: serial.");
  });

  it("applies inclusive ranges, $times, and global copies", () => {
    const parsed = parseBatchCsv("name,$times\nA,2\nB,0\nC,3");
    const rows = buildBatchPrintRows(parsed, 1, 3, 2);

    expect(rows.map((row) => [row.sourceRow, row.quantity])).toEqual([[1, 4], [3, 6]]);
    expect(totalBatchLabels(rows)).toBe(10);
  });
});

describe("preprocessString", () => {
  it("substitutes variables while keeping unknown placeholders", () => {
    expect(preprocessString("SKU {sku} / {missing}", { sku: "ABC" })).toBe("SKU ABC / {missing}");
  });

  it("substitutes text, QR, and barcode objects on a temporary canvas", () => {
    // Use class prototypes without invoking Fabric constructors, which require a browser document.
    const text = Object.assign(Object.create(TextboxExt.prototype), { text: "{name}", fontAutoSize: false }) as TextboxExt;
    const qr = Object.assign(Object.create(QRCode.prototype), { text: "https://example.com/{id}" }) as QRCode;
    const barcode = Object.assign(Object.create(Barcode.prototype), { text: "{code}" }) as Barcode;
    const objects: fabric.FabricObject[] = [text, qr, barcode];
    const canvas = {
      forEachObject(callback: (object: fabric.FabricObject) => void) {
        objects.forEach(callback);
      },
    } as unknown as fabric.Canvas;

    canvasPreprocess(canvas, { name: "Widget", id: "42", code: "ABC123" });

    expect(text.text).toBe("Widget");
    expect(qr.text).toBe("https://example.com/42");
    expect(barcode.text).toBe("ABC123");
  });
});
