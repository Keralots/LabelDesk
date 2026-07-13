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
import type { FabricJson, LabelProps, PostProcessType } from "$/types";

export type ConnState = "disconnected" | "connecting" | "connected";
export type PrintState = "idle" | "sending" | "printing";

export const connectionState = writable<ConnState>("disconnected");
export const printerName = writable<string>("");
export const printerMeta = writable<PrinterModelMeta | undefined>();
export const heartbeat = writable<HeartbeatData | undefined>();
export const printState = writable<PrintState>("idle");
export const printProgress = writable<number>(0);
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
}

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
    canvasPreprocess(fabricTempCanvas, {});
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

/** Render label JSON to a 1-bit image and send it to the printer. */
export const printLabel = async (
  canvasJson: FabricJson,
  labelProps: LabelProps,
  options: PrintOptions = {},
): Promise<void> => {
  if (client === undefined || get(connectionState) !== "connected") {
    throw new Error("Printer not connected");
  }

  const quantity = options.quantity ?? 1;
  const density = options.density ?? get(printerMeta)?.densityDefault ?? 3;

  printError.set("");
  printState.set("sending");
  printProgress.set(0);

  try {
    const printCanvas = await renderPrintCanvas(canvasJson, labelProps, options);

    const taskName: PrintTaskName = client.getPrintTaskType() ?? "D110";
    console.log(`Print task: ${taskName}, density ${density}, quantity ${quantity}`);

    client.stopHeartbeat();

    const task = client.abstraction.newPrintTask(taskName, {
      totalPages: quantity,
      density,
      speed: 1,
      labelType: LabelType.WithGaps,
      statusPollIntervalMs: 100,
      statusTimeoutMs: 8_000,
    });

    const listener = (e: PrintProgressEvent) => {
      printProgress.set(Math.floor((e.page / quantity) * ((e.pagePrintProgress + e.pageFeedProgress) / 2)));
    };

    try {
      const encoded: EncodedImage = ImageEncoder.encodeCanvas(printCanvas, labelProps.printDirection);
      await task.printInit();
      await task.printPage(encoded, quantity);

      printState.set("printing");
      client.on("printprogress", listener);
      await task.waitForFinished();
    } finally {
      client.off("printprogress", listener);
      await task.printEnd().catch((e) => console.warn("printEnd failed", e));
      client.startHeartbeat();
    }
  } catch (e) {
    printError.set(`${e}`);
    throw e;
  } finally {
    printState.set("idle");
    printProgress.set(0);
  }
};
