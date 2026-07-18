import { afterEach, describe, expect, it, vi } from "vitest";
import type { EncodedImage } from "@mmote/niimbluelib";
import {
  executeBatchPrintTask,
  waitForPagesReported,
  PrintCancelledError,
  type PrinterPageStatus,
  type PrintStatusSource,
  type PrintTaskPort,
} from "$/printer";

const image = {} as EncodedImage;

const makeTask = (): PrintTaskPort => ({
  printInit: vi.fn(async () => undefined),
  printPage: vi.fn(async () => undefined),
  waitForPageFinished: vi.fn(async () => undefined),
  waitForFinished: vi.fn(async () => undefined),
  printEnd: vi.fn(async () => true),
});

const makeStatusSource = (sequence: PrinterPageStatus[]) => {
  const source = {
    calls: 0,
    getPrintStatus: vi.fn(async (): Promise<PrinterPageStatus> => {
      const status = sequence[Math.min(source.calls, sequence.length - 1)];
      source.calls += 1;
      return status;
    }),
    setPacketTimeout: vi.fn(),
    setDefaultPacketTimeout: vi.fn(),
  };
  return source satisfies PrintStatusSource & { calls: number };
};

describe("waitForPagesReported", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the printer reports at least the expected page", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    const source = makeStatusSource([
      { page: 0, pagePrintProgress: 50, pageFeedProgress: 0 },
      { page: 2, pagePrintProgress: 100, pageFeedProgress: 100 },
    ]);
    const seen: number[] = [];

    const promise = waitForPagesReported(source, 1, {
      pollIntervalMs: 200,
      onStatus: (status) => seen.push(status.page),
    });
    await vi.advanceTimersByTimeAsync(400);
    await promise;

    expect(seen).toEqual([0, 2]);
    expect(source.setPacketTimeout).toHaveBeenCalledWith(8_000);
    expect(source.setDefaultPacketTimeout).toHaveBeenCalledOnce();
  });

  it("fails when the reported status stops changing, resetting the deadline on progress", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    const source = makeStatusSource([
      { page: 0, pagePrintProgress: 10, pageFeedProgress: 0 },
      { page: 0, pagePrintProgress: 20, pageFeedProgress: 0 },
      { page: 0, pagePrintProgress: 30, pageFeedProgress: 0 },
      { page: 0, pagePrintProgress: 40, pageFeedProgress: 0 },
      { page: 0, pagePrintProgress: 50, pageFeedProgress: 0 },
      { page: 0, pagePrintProgress: 60, pageFeedProgress: 0 },
    ]);

    let settled: unknown;
    const promise = waitForPagesReported(source, 1, {
      pollIntervalMs: 200,
      stallTimeoutMs: 1_000,
    }).then(
      () => (settled = "resolved"),
      (error) => (settled = error),
    );

    // Status keeps changing during the first 1.2s, so the initial 1s deadline
    // must have been pushed forward.
    await vi.advanceTimersByTimeAsync(1_500);
    expect(settled).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1_500);
    await promise;
    expect(settled).toBeInstanceOf(Error);
    expect((settled as Error).message).toContain("did not confirm page 1");
    expect(source.setDefaultPacketTimeout).toHaveBeenCalledOnce();
  });

  it("rejects with PrintCancelledError when aborted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    const source = makeStatusSource([{ page: 0, pagePrintProgress: 0, pageFeedProgress: 0 }]);
    const abort = new AbortController();

    let settled: unknown;
    const promise = waitForPagesReported(source, 1, {
      pollIntervalMs: 200,
      signal: abort.signal,
    }).then(
      () => (settled = "resolved"),
      (error) => (settled = error),
    );

    await vi.advanceTimersByTimeAsync(300);
    abort.abort();
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(settled).toBeInstanceOf(PrintCancelledError);
  });
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

  it("does not let a failed printEnd mask the original error", async () => {
    const task = makeTask();
    vi.mocked(task.printPage).mockRejectedValueOnce(new Error("send failed"));
    vi.mocked(task.printEnd).mockRejectedValueOnce(new Error("printEnd failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(executeBatchPrintTask(
      task,
      [{ sourceRow: 1, quantity: 1, times: 1, values: {} }],
      async () => image,
    )).rejects.toThrow("send failed");

    warn.mockRestore();
  });

  it("does not fail a successful batch when only printEnd fails", async () => {
    const task = makeTask();
    vi.mocked(task.printEnd).mockRejectedValueOnce(new Error("printEnd failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(executeBatchPrintTask(
      task,
      [{ sourceRow: 1, quantity: 1, times: 1, values: {} }],
      async () => image,
    )).resolves.toBeUndefined();

    warn.mockRestore();
  });
});
