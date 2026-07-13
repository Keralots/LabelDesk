import { describe, expect, it } from "vitest";
import { compressBuffer, decompressBuffer } from "$/utils/binary_utils";

describe("binary compression", () => {
  it("round-trips arbitrary font-like bytes through gzip", async () => {
    const source = new TextEncoder().encode("font-data\0with-binary-like-content".repeat(64));
    const compressed = await compressBuffer(source);
    const restored = new Uint8Array(await decompressBuffer(compressed));

    expect(restored).toEqual(source);
    expect(compressed.byteLength).toBeLessThan(source.byteLength);
  });
});
