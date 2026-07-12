import { writable } from "svelte/store";
import { CsvParamsSchema, type CsvParams } from "$/types";
import { CSV_DEFAULT } from "$/defaults";
import { writablePersisted } from "$/utils/persistence";

/** Fonts loaded from user-provided font files */
export const loadedFonts = writable<FontFace[]>([]);

/** CSV data for variable substitution in label objects */
export const csvData = writablePersisted<CsvParams>("csv_params", CsvParamsSchema, { data: CSV_DEFAULT });
