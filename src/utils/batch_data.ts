import { csvParseRows } from "d3-dsv";
import type { BatchParseResult, BatchPrintRow, BatchRow, FabricJson } from "$/types";
import { extractVariableKeys } from "$/utils/canvas_preprocess";

const BUILTIN_VARIABLES = new Set(["dt"]);

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : `${error}`;

/** Parse and validate comma-separated batch data. */
export const parseBatchCsv = (data: string): BatchParseResult => {
  const errors: string[] = [];
  let table: string[][];

  try {
    table = csvParseRows(data);
  } catch (error) {
    return {
      columns: [],
      rows: [],
      errors: [`CSV parse error: ${errorMessage(error)}`],
      valid: false,
    };
  }

  if (table.length === 0) {
    return { columns: [], rows: [], errors: ["CSV data is empty."], valid: false };
  }

  const columns = table[0].map((column, index) => index === 0 ? column.replace(/^\uFEFF/, "") : column);
  const seen = new Set<string>();

  columns.forEach((column, index) => {
    if (column.length === 0) {
      errors.push(`Header ${index + 1} is empty.`);
    } else if (seen.has(column)) {
      errors.push(`Header "${column}" is duplicated.`);
    }
    seen.add(column);
  });

  const rows: BatchRow[] = [];

  table.slice(1).forEach((fields, index) => {
    const sourceRow = index + 1;
    if (fields.length !== columns.length) {
      errors.push(`Row ${sourceRow} has ${fields.length} fields; expected ${columns.length}.`);
      return;
    }

    const values: Record<string, string> = {};
    columns.forEach((column, columnIndex) => {
      values[column] = fields[columnIndex].replaceAll("\\n", "\n");
    });

    const rawTimes = values.$times ?? "";
    let times = 1;
    if (rawTimes !== "") {
      if (!/^\d+$/.test(rawTimes)) {
        errors.push(`Row ${sourceRow} has invalid $times value "${rawTimes}".`);
        times = 0;
      } else {
        times = Number(rawTimes);
        if (!Number.isSafeInteger(times)) {
          errors.push(`Row ${sourceRow} has an unsafe $times value.`);
          times = 0;
        }
      }
    }

    rows.push({ sourceRow, values, times });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push("CSV data has a header but no data rows.");
  }

  return { columns, rows, errors, valid: errors.length === 0 };
};

const visitTextValues = (value: unknown, result: Set<string>) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => visitTextValues(entry, result));
    return;
  }
  if (value === null || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    extractVariableKeys(record.text).forEach((key) => result.add(key));
  }
  Object.entries(record).forEach(([key, entry]) => {
    if (key !== "text") visitTextValues(entry, result);
  });
};

/** Find variable names used in text-bearing objects without changing the Fabric JSON. */
export const extractCanvasVariableKeys = (canvasJson: FabricJson): string[] => {
  const result = new Set<string>();
  visitTextValues(canvasJson.objects, result);
  return [...result];
};

/** Add label-placeholder validation to a parsed CSV result. */
export const validateBatchForCanvas = (parsed: BatchParseResult, canvasJson: FabricJson): BatchParseResult => {
  const errors = [...parsed.errors];
  const headers = new Set(parsed.columns);
  const missing = extractCanvasVariableKeys(canvasJson)
    .filter((key) => !BUILTIN_VARIABLES.has(key) && !headers.has(key));

  if (missing.length > 0) {
    errors.push(`Missing CSV ${missing.length === 1 ? "column" : "columns"}: ${missing.join(", ")}.`);
  }

  return { ...parsed, errors, valid: errors.length === 0 };
};

/** Select an inclusive source-row range and apply global copies. */
export const buildBatchPrintRows = (
  parsed: BatchParseResult,
  startRow: number,
  endRow: number,
  copies: number,
): BatchPrintRow[] => {
  if (!parsed.valid) return [];
  if (!Number.isInteger(startRow) || !Number.isInteger(endRow) || startRow < 1 || endRow < startRow) return [];
  if (!Number.isInteger(copies) || copies < 1 || copies > 99) return [];

  return parsed.rows
    .filter((row) => row.sourceRow >= startRow && row.sourceRow <= endRow && row.times > 0)
    .map((row) => ({ ...row, quantity: row.times * copies }));
};

export const totalBatchLabels = (rows: BatchPrintRow[]): number =>
  rows.reduce((total, row) => total + row.quantity, 0);
