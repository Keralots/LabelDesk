export const bufferToBase64 = (buffer: ArrayBuffer): Promise<string> => {
  const blob = new Blob([buffer]);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const asBytes = (buffer: BufferSource): Uint8Array<ArrayBuffer> => {
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

export const compressBuffer = async (buffer: BufferSource): Promise<ArrayBuffer> => {
  const stream = new Blob([asBytes(buffer)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
};

export const decompressBuffer = async (buffer: BufferSource, maximumOutputBytes = Number.POSITIVE_INFINITY): Promise<ArrayBuffer> => {
  const stream = new Blob([asBytes(buffer)]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumOutputBytes) {
      await reader.cancel();
      throw new Error("Decompressed data exceeds the allowed size.");
    }
    chunks.push(new Uint8Array(value));
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
};
