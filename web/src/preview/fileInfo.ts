/** Pure helpers for the file viewer and info panel. */

/** A size the way the file list shows it (Storage Browser's `humanFileSize(size, true)`: 1000-based). */
export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1000;
    unit++;
  } while (value >= 999.95 && unit < units.length - 1);
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** The name after the last "/". */
export function fileName(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

/** The folder part of a key, with its trailing "/" ("" at the top). */
export function folderOf(key: string): string {
  return key.slice(0, key.lastIndexOf("/") + 1);
}

/** The extension in lower case, without the dot, or undefined. */
export function extensionOf(key: string): string | undefined {
  const name = fileName(key);
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : undefined;
}

/** "3 of 12", or "" when the file isn't on the listed page. */
export function positionText(position: { index: number; count: number } | undefined): string {
  return position ? `${position.index} of ${position.count}` : "";
}
