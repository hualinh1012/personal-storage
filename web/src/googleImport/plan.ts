import { isSameOrSibling, sanitiseName, withSuffix } from "./names";
import type { QueueItem } from "./queue";

/** A file as Google Picker returns it (the fields we use). */
export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

/** A file already in the destination folder (name relative to it). */
export interface ExistingFile {
  name: string;
  size?: number;
}

/** One row of an import: where a Google file goes and what happens to it. */
export interface ImportItem extends QueueItem {
  name: string;
  key: string;
  contentType: string;
  size?: number;
}

/** A file to place in one destination folder. `size` undefined means unknown (converted files). */
export interface Placement {
  name: string;
  size?: number;
}

export type Decision = { action: "copy"; name: string } | { action: "skip"; reason: string };

export const ALREADY_IMPORTED = "Already imported.";

/**
 * Decides, for files going into one folder, which are already there and what
 * the others are called. Nothing is ever overwritten:
 * - same name (or a "name (n).ext" sibling) with the same size → already imported;
 *   each existing file can only account for one incoming file;
 * - size unknown (converted files) → any same-name or sibling file counts;
 * - otherwise the name, or the next free "name (n).ext" if it's taken, by an
 *   existing file or by an earlier file in the same batch.
 */
export function decideNames(incoming: Placement[], existing: ExistingFile[]): Decision[] {
  const unclaimed = [...existing];
  const taken = new Set(existing.map((e) => e.name));
  return incoming.map((file): Decision => {
    const match = unclaimed.findIndex(
      (e) => isSameOrSibling(file.name, e.name) && (file.size === undefined || e.size === file.size),
    );
    if (match >= 0) {
      unclaimed.splice(match, 1);
      return { action: "skip", reason: ALREADY_IMPORTED };
    }
    let name = file.name;
    for (let n = 1; taken.has(name); n++) name = withSuffix(file.name, n);
    taken.add(name);
    return { action: "copy", name };
  });
}

const GOOGLE_NATIVE = "application/vnd.google-apps.";

/**
 * Picked files → import items under `prefix` (the open folder, ending in "/"),
 * given the files already there. Google-native files are skipped until
 * conversion lands.
 */
export function planPickedFiles(files: PickedFile[], prefix: string, existing: ExistingFile[]): ImportItem[] {
  const base = (f: PickedFile) => ({ id: f.id, name: sanitiseName(f.name), contentType: f.mimeType, size: f.sizeBytes });
  const copyable = files.filter((f) => !f.mimeType.startsWith(GOOGLE_NATIVE));
  const decisions = new Map(
    decideNames(copyable.map((f) => ({ name: sanitiseName(f.name), size: f.sizeBytes })), existing).map((d, i) => [
      copyable[i].id,
      d,
    ]),
  );
  return files.map((f): ImportItem => {
    const b = base(f);
    const d = decisions.get(f.id);
    if (!d) return { ...b, key: prefix + b.name, status: "skipped", reason: "Google Docs, Sheets and Slides aren't supported yet." };
    if (d.action === "skip") return { ...b, key: prefix + b.name, status: "skipped", reason: d.reason };
    return { ...b, name: d.name, key: prefix + d.name, status: "queued" };
  });
}
