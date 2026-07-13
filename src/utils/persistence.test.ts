import { beforeEach, describe, expect, it } from "vitest";
import type { EditorSession } from "$/types";
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
