import { describe, expect, it, vi } from "vitest";
import type { EncodedImage } from "@mmote/niimbluelib";
import { executeBatchPrintTask, type PrintTaskPort } from "$/printer";

const image = {} as EncodedImage;

const makeTask = (): PrintTaskPort => ({
  printInit: vi.fn(async () => undefined),
  printPage: vi.fn(async () => undefined),
  waitForPageFinished: vi.fn(async () => undefined),
  waitForFinished: vi.fn(async () => undefined),
  printEnd: vi.fn(async () => true),
});

describe("executeBatchPrintTask", () => {
  it("initializes once, sends ordered rows, waits, and cleans up once", async () => {
    const task = makeTask();
    const started: number[] = [];
    const completed: number[] = [];

    await executeBatchPrintTask(
      task,
      [
        { sourceRow: 2, quantity: 3, times: 3, values: { name: "A" } },
        { sourceRow: 3, quantity: 1, times: 1, values: { name: "B" } },
      ],
      async () => image,
      (row) => started.push(row.sourceRow),
      (row) => completed.push(row.sourceRow),
    );

    expect(task.printInit).toHaveBeenCalledOnce();
    expect(task.printPage).toHaveBeenNthCalledWith(1, image, 3);
    expect(task.printPage).toHaveBeenNthCalledWith(2, image, 1);
    expect(task.waitForPageFinished).toHaveBeenCalledTimes(2);
    expect(task.waitForFinished).toHaveBeenCalledOnce();
    expect(task.printEnd).toHaveBeenCalledOnce();
    expect(started).toEqual([2, 3]);
    expect(completed).toEqual([2, 3]);
  });

  it("ends the task when a row fails and does not send later rows", async () => {
    const task = makeTask();
    vi.mocked(task.printPage).mockRejectedValueOnce(new Error("send failed"));

    await expect(executeBatchPrintTask(
      task,
      [
        { sourceRow: 1, quantity: 1, times: 1, values: {} },
        { sourceRow: 2, quantity: 1, times: 1, values: {} },
      ],
      async () => image,
    )).rejects.toThrow("send failed");

    expect(task.printPage).toHaveBeenCalledOnce();
    expect(task.waitForPageFinished).not.toHaveBeenCalled();
    expect(task.waitForFinished).not.toHaveBeenCalled();
    expect(task.printEnd).toHaveBeenCalledOnce();
  });
});
