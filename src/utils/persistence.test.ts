import { beforeEach, describe, expect, it } from "vitest";
import { StoredLabelTemplateSchema, type EditorSession, type ExportedLabelTemplate } from "$/types";
import { LocalStoragePersistence } from "$/utils/persistence";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const session: EditorSession = {
  version: 1,
  canvas: { version: "7.0.0", objects: [] },
  label: { printDirection: "left", size: { width: 400, height: 240 } },
  title: "Shipping label",
  batchEnabled: true,
  csv: { data: "name\nWidget" },
  dirty: true,
};

describe("editor session persistence", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it("round-trips the active document and recovery metadata", () => {
    LocalStoragePersistence.saveEditorSession(session);

    expect(LocalStoragePersistence.loadEditorSession()).toMatchObject(session);
  });

  it("clears a saved recovery session", () => {
    LocalStoragePersistence.saveEditorSession(session);
    LocalStoragePersistence.clearEditorSession();

    expect(LocalStoragePersistence.loadEditorSession()).toBeNull();
  });

  it("rejects incompatible session versions", () => {
    expect(() =>
      LocalStoragePersistence.saveEditorSession({ ...session, version: 2 } as never),
    ).toThrow();
  });
});

/** Storage that exposes keys as own properties, like the browser's localStorage. */
class EnumerableStorage {
  /** Simulates a storage quota as a maximum number of stored items. */
  maxItems = Infinity;

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this, key) ? (this as unknown as Record<string, string>)[key] : null;
  }

  setItem(key: string, value: string): void {
    if (!Object.prototype.hasOwnProperty.call(this, key) && Object.keys(this).length - 1 >= this.maxItems) {
      throw new Error("QuotaExceededError");
    }
    (this as unknown as Record<string, string>)[key] = String(value);
  }

  removeItem(key: string): void {
    delete (this as unknown as Record<string, string>)[key];
  }
}

const template = (title: string, timestamp: number): ExportedLabelTemplate => ({
  canvas: { version: "7.0.0", objects: [] },
  label: { printDirection: "left", size: { width: 400, height: 240 } },
  title,
  timestamp,
});

describe("label library persistence", () => {
  let storage: EnumerableStorage;

  beforeEach(() => {
    storage = new EnumerableStorage();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  });

  it("saves and reloads labels", () => {
    const result = LocalStoragePersistence.saveLabels([template("Glasses", 100), template("Jars", 200)]);

    expect(result).toEqual({ zodErrors: [], otherErrors: [] });
    expect(LocalStoragePersistence.loadLabels().map((label) => label.title)).toEqual(["Glasses", "Jars"]);
  });

  it("does not store the storage-assigned id", () => {
    LocalStoragePersistence.saveLabels([{ ...template("Glasses", 100), id: "saved_label_100_0" }]);

    expect(JSON.parse(storage.getItem("saved_label_100_0")!)).not.toHaveProperty("id");
  });

  it("keeps the existing library when a label fails validation", () => {
    LocalStoragePersistence.saveLabels([template("Glasses", 100)]);

    const result = LocalStoragePersistence.saveLabels([
      template("Glasses", 100),
      { ...template("Broken", 200), title: "x".repeat(201) },
    ]);

    expect(result.zodErrors).toHaveLength(1);
    expect(LocalStoragePersistence.loadLabels().map((label) => label.title)).toEqual(["Glasses"]);
  });

  it("restores the existing library when storage rejects a write", () => {
    LocalStoragePersistence.saveLabels([template("Glasses", 100)]);
    storage.maxItems = 1;

    const result = LocalStoragePersistence.saveLabels([template("Glasses", 100), template("Jars", 200)]);

    expect(result.otherErrors).toHaveLength(1);
    expect(LocalStoragePersistence.loadLabels().map((label) => label.title)).toEqual(["Glasses"]);
  });
});

describe("stored label template schema", () => {
  it("still enforces the embedded font size limit", () => {
    const font = { family: "Big", mimeType: "font/ttf" as const, gzippedDataB64: "A".repeat(2_000_000) };
    const result = StoredLabelTemplateSchema.safeParse({ ...template("Fonts", 1), fonts: [font, font, font, font, font] });

    expect(result.success).toBe(false);
  });
});
