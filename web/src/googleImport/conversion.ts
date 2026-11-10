/**
 * Google-native files have no bytes to download; they're exported instead.
 * Docs and Slides become PDF, Sheets become .xlsx. Other native types
 * (Forms, Sites, Maps, Drawings, shortcuts, …) can't be imported.
 */

const NATIVE = "application/vnd.google-apps.";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface Conversion {
  exportMimeType: string;
  ext: string;
}

const CONVERSIONS: Record<string, Conversion> = {
  [`${NATIVE}document`]: { exportMimeType: "application/pdf", ext: ".pdf" },
  [`${NATIVE}presentation`]: { exportMimeType: "application/pdf", ext: ".pdf" },
  [`${NATIVE}spreadsheet`]: { exportMimeType: XLSX, ext: ".xlsx" },
};

export const isGoogleNative = (mimeType: string) => mimeType.startsWith(NATIVE);

/** How to import a file: as is (null), converted, or not at all ("unsupported"). */
export function conversionFor(mimeType: string): Conversion | "unsupported" | null {
  if (!isGoogleNative(mimeType)) return null;
  return CONVERSIONS[mimeType] ?? "unsupported";
}

/** "Budget" → "Budget.xlsx"; a name that already ends in the extension keeps it. */
export function convertedName(name: string, ext: string): string {
  return name.toLowerCase().endsWith(ext) ? name : name + ext;
}
