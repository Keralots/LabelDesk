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

  it("streams buffers larger than the compression backpressure threshold", async () => {
    let state = 0x12345678;
    const source = new Uint8Array(128 * 1024);
    for (let index = 0; index < source.length; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      source[index] = state >>> 24;
    }

    const compressed = await compressBuffer(source);
    const restored = new Uint8Array(await decompressBuffer(compressed));

    expect(restored).toEqual(source);
  });

  it("stops decompression when the output exceeds its limit", async () => {
    const source = new TextEncoder().encode("highly-compressible-data".repeat(10_000));
    const compressed = await compressBuffer(source);

    await expect(decompressBuffer(compressed, 1_024)).rejects.toThrow(/exceeds the allowed size/);
  });
});
