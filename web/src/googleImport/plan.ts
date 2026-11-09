import { sanitiseName } from "./names";
import type { QueueItem } from "./queue";

/** A file as Google Picker returns it (the fields we use). */
export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

/** One row of an import: where a Google file goes and what happens to it. */
export interface ImportItem extends QueueItem {
  name: string;
  key: string;
  contentType: string;
  size?: number;
}

const GOOGLE_NATIVE = "application/vnd.google-apps.";

/**
 * Picked files → import items under `prefix` (the open folder, ending in "/").
 * Google-native files are skipped until conversion lands, and so is any file
 * that would land on the same key as an earlier one in the same import.
 */
export function planPickedFiles(files: PickedFile[], prefix: string): ImportItem[] {
  const taken = new Set<string>();
  return files.map((f): ImportItem => {
    const name = sanitiseName(f.name);
    const base = { id: f.id, name, key: prefix + name, contentType: f.mimeType, size: f.sizeBytes };
    if (f.mimeType.startsWith(GOOGLE_NATIVE)) {
      return { ...base, status: "skipped", reason: "Google Docs, Sheets and Slides aren't supported yet." };
    }
    if (taken.has(base.key)) {
      return { ...base, status: "skipped", reason: "Another picked file has the same name." };
    }
    taken.add(base.key);
    return { ...base, status: "queued" };
  });
}
