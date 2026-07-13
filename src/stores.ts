import { writable } from "svelte/store";
import { z } from "zod";
import { CsvParamsSchema, UserFontSchema, type CsvParams, type UserFont } from "$/types";
import { CSV_DEFAULT } from "$/defaults";
import { writablePersisted } from "$/utils/persistence";
import { MAX_USER_FONTS } from "$/utils/import_safety";

/** Fonts loaded from user-provided font files */
export const loadedFonts = writable<FontFace[]>([]);
export const loadedFontFamilies = writable<string[]>([]);
export const fontLoadErrors = writable<string[]>([]);
export const userFonts = writablePersisted<UserFont[]>("user_fonts", z.array(UserFontSchema).max(MAX_USER_FONTS), []);

/** CSV data for variable substitution in label objects */
export const csvData = writablePersisted<CsvParams>("csv_params", CsvParamsSchema, { data: CSV_DEFAULT });
