import { get, writable } from "svelte/store";
import {
  NiimbotBluetoothClient,
  ImageEncoder,
  LabelType,
  RequestCommandId,
  ResponseCommandId,
  Utils,
  type EncodedImage,
  type HeartbeatData,
  type NiimbotAbstractClient,
  type PrinterModelMeta,
  type PrintProgressEvent,
  type PrintTaskName,
} from "@mmote/niimbluelib";
import { CustomCanvas } from "$/fabric-object/custom_canvas";
import { canvasPreprocess } from "$/utils/canvas_preprocess";
import { copyImageData, threshold, atkinson, bayer } from "$/utils/post_process";
import type { BatchPrintRow, FabricJson, LabelProps, PostProcessType } from "$/types";

export type ConnState = "disconnected" | "connecting" | "connected";
export type PrintState = "idle" | "sending" | "printing";

export const connectionState = writable<ConnState>("disconnected");
export const printerName = writable<string>("");
export const printerMeta = writable<PrinterModelMeta | undefined>();
export const heartbeat = writable<HeartbeatData | undefined>();
export const printState = writable<PrintState>("idle");
export const printProgress = writable<number>(0);
export const printCurrentRow = writable<number>(0);
export const printError = writable<string>("");

let client: NiimbotBluetoothClient | undefined;

const PACKET_LOG = false;

export const getClient = (): NiimbotAbstractClient | undefined => client;

const initClient = (): NiimbotBluetoothClient => {
  if (client !== undefined) {
    return client;
  }

  client = new NiimbotBluetoothClient();

  if (PACKET_LOG) {
    client.on("packetsent", (e) => {
      console.log(`>> ${Utils.bufToHex(e.packet.toBytes())} (${RequestCommandId[e.packet.command]})`);
    });
    client.on("packetreceived", (e) => {
      console.log(`<< ${Utils.bufToHex(e.packet.toBytes())} (${ResponseCommandId[e.packet.command]})`);
    });
  }

  client.on("connect", (e) => {
    connectionState.set("connected");
    printerName.set(e.info.deviceName ?? "unknown");
  });

  client.on("printerinfofetched", () => {
    printerMeta.set(client?.getModelMetadata());
  });

  client.on("disconnect", () => {
    connectionState.set("disconnected");
    printerName.set("");
    printerMeta.set(undefined);
    heartbeat.set(undefined);
  });

  client.on("heartbeat", (e) => {
    heartbeat.set(e.data);
  });

  client.on("heartbeatfailed", (e) => {
    console.warn(`Heartbeat failed ${e.failedAttempts}/5`);
    if (e.failedAttempts >= 5) {
      client?.disconnect();
    }
  });

  return client;
};

export const connect = async (): Promise<void> => {
  const c = initClient();
  connectionState.set("connecting");
  try {
    await c.connect();
  } catch (e) {
    connectionState.set("disconnected");
    throw e;
  }
};

export const disconnect = async (): Promise<void> => {
  await client?.disconnect();
};

export interface PrintOptions {
  quantity?: number;
  density?: number;
  postProcess?: PostProcessType;
  threshold?: number;
  variables?: Record<string, string>;
}

export interface PrintTaskPort {
  printInit(): Promise<void>;
  printPage(image: EncodedImage, quantity?: number): Promise<void>;
  waitForPageFinished(): Promise<void>;
  waitForFinished(): Promise<void>;
  printEnd(): Promise<boolean>;
}

/** Execute a batch against one initialized task and always end the task. */
export const executeBatchPrintTask = async (
  task: PrintTaskPort,
  rows: BatchPrintRow[],
  encodeRow: (row: BatchPrintRow) => Promise<EncodedImage>,
  onRowStarted?: (row: BatchPrintRow) => void,
  onRowCompleted?: (row: BatchPrintRow) => void,
): Promise<void> => {
  try {
    await task.printInit();
    for (const row of rows) {
      onRowStarted?.(row);
      const image = await encodeRow(row);
      await task.printPage(image, row.quantity);
      await task.waitForPageFinished();
      onRowCompleted?.(row);
    }
    await task.waitForFinished();
  } finally {
    await task.printEnd();
  }
};

/** Render label JSON to a 1-bit canvas (shared by the print dialog preview and the print path). */
export const renderPrintCanvas = async (
  canvasJson: FabricJson,
  labelProps: LabelProps,
  options: PrintOptions = {},
): Promise<HTMLCanvasElement> => {
  const thresholdValue = options.threshold ?? 140;

  const fabricTempCanvas = new CustomCanvas(undefined, {
    width: labelProps.size.width,
    height: labelProps.size.height,
  });

  try {
    fabricTempCanvas.setCustomBackground(false);
    fabricTempCanvas.setHighlightMirror(false);
    fabricTempCanvas.setLabelProps(labelProps);
    await fabricTempCanvas.loadFromJSON(canvasJson);
    canvasPreprocess(fabricTempCanvas, options.variables ?? {});
    await fabricTempCanvas.createMirroredObjects();
    fabricTempCanvas.renderAll();

    const preRendered = fabricTempCanvas.toCanvasElement();
    const ctx = preRendered.getContext("2d")!;
    let iData = copyImageData(ctx.getImageData(0, 0, preRendered.width, preRendered.height));

    if (options.postProcess === "dither") {
      iData = atkinson(iData, thresholdValue);
    } else if (options.postProcess === "bayer") {
      iData = bayer(iData, thresholdValue);
    } else {
      iData = threshold(iData, thresholdValue);
    }

    const printCanvas = document.createElement("canvas");
    printCanvas.width = preRendered.width;
    printCanvas.height = preRendered.height;
    const printCtx = printCanvas.getContext("2d")!;
    printCtx.fillStyle = "white";
    printCtx.fillRect(0, 0, printCanvas.width, printCanvas.height);
    printCtx.putImageData(iData, 0, 0);
    return printCanvas;
  } finally {
    fabricTempCanvas.dispose();
  }
};

/** Render and print different variable rows as one printer task. */
export const printBatch = async (
  canvasJson: FabricJson,
  labelProps: LabelProps,
  rows: BatchPrintRow[],
  options: PrintOptions = {},
): Promise<void> => {
  if (client === undefined || get(connectionState) !== "connected") {
    throw new Error("Printer not connected");
  }

  const totalPages = rows.reduce((total, row) => total + row.quantity, 0);
  if (rows.length === 0 || totalPages < 1) {
    throw new Error("Batch has no labels to print");
  }

  const density = options.density ?? get(printerMeta)?.densityDefault ?? 3;
  const taskName: PrintTaskName = client.getPrintTaskType() ?? "D110";

  printError.set("");
  printState.set("sending");
  printProgress.set(0);
  printCurrentRow.set(0);

  try {
    console.log(`Print task: ${taskName}, density ${density}, pages ${totalPages}`);
    const task = client.abstraction.newPrintTask(taskName, {
      totalPages,
      density,
      speed: 1,
      labelType: LabelType.WithGaps,
      statusPollIntervalMs: 100,
      statusTimeoutMs: 8_000,
    });
    client.stopHeartbeat();

    let completedPages = 0;
    const listener = (event: PrintProgressEvent) => {
      const stageProgress = (event.pagePrintProgress + event.pageFeedProgress) / 200;
      const overall = ((Math.max(0, event.page - 1) + stageProgress) / totalPages) * 100;
      printProgress.set(Math.min(99, Math.max(0, Math.floor(overall))));
    };

    client.on("printprogress", listener);
    try {
      await executeBatchPrintTask(
        task,
        rows,
        async (row) => {
          const canvas = await renderPrintCanvas(canvasJson, labelProps, {
            ...options,
            variables: row.values,
          });
          return ImageEncoder.encodeCanvas(canvas, labelProps.printDirection);
        },
        (row) => {
          printCurrentRow.set(row.sourceRow);
          printState.set("printing");
        },
        (row) => {
          completedPages += row.quantity;
          printProgress.set(Math.floor((completedPages / totalPages) * 100));
        },
      );
    } finally {
      client.off("printprogress", listener);
      client.startHeartbeat();
    }
  } catch (error) {
    printError.set(`${error}`);
    throw error;
  } finally {
    printState.set("idle");
    printProgress.set(0);
    printCurrentRow.set(0);
  }
};

/** Render label JSON to a 1-bit image and send it to the printer. */
export const printLabel = async (
  canvasJson: FabricJson,
  labelProps: LabelProps,
  options: PrintOptions = {},
): Promise<void> => {
  const quantity = options.quantity ?? 1;
  await printBatch(
    canvasJson,
    labelProps,
    [{ sourceRow: 1, values: options.variables ?? {}, times: 1, quantity }],
    options,
  );
};
