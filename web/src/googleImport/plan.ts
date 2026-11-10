import { conversionFor, convertedName } from "./conversion";
import { isSameOrSibling, sanitiseName, withSuffix } from "./names";
import type { QueueItem } from "./queue";

/** A file or folder as Google Picker or the Drive listing returns it (the fields we use). */
export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

/** A file already in a destination folder (name relative to it). */
export interface ExistingFile {
  name: string;
  size?: number;
}

/** One row of an import. */
export interface ImportItem extends QueueItem {
  kind: "file" | "folder";
  /** Google file ID ("" for a folder placeholder). */
  fileId: string;
  /** Final name in Family Drive. */
  name: string;
  /** Shown in the list: the name with its folder path below the open folder. */
  path: string;
  /** S3 key; a folder placeholder's ends in "/". */
  key: string;
  contentType: string;
  /** Size in Drive; absent for converted files (Drive doesn't report one). */
  size?: number;
  /** Set for Google Docs, Sheets and Slides: what to export them as. */
  exportMimeType?: string;
}

/** A file to place in one destination folder. `size` undefined means unknown (converted files). */
export interface Placement {
  name: string;
  size?: number;
}

/** "skip" carries the existing file that already accounts for this one. */
export type Decision = { action: "copy"; name: string } | { action: "skip"; reason: string; name: string };

export const ALREADY_IMPORTED = "Already imported.";
/** Bigger files would have to sit in the browser's memory whole; there's no streaming yet. */
export const MAX_IMPORT_BYTES = 500 * 1024 * 1024;
export const TOO_LARGE = "Too large to import in the browser; download it from Google.";
export const NOT_SUPPORTED = "This kind of Google file can't be imported (only Docs, Sheets and Slides).";

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
      const [existingFile] = unclaimed.splice(match, 1);
      return { action: "skip", reason: ALREADY_IMPORTED, name: existingFile.name };
    }
    let name = file.name;
    for (let n = 1; taken.has(name); n++) name = withSuffix(file.name, n);
    taken.add(name);
    return { action: "copy", name };
  });
}

/**
 * Files going into one destination folder → import items. `root` is the open
 * folder's prefix, `dir` the path below it ("" or "Photos/2024/"), `existing`
 * the files already in that folder.
 */
export function planFolder(files: PickedFile[], root: string, dir: string, existing: ExistingFile[]): ImportItem[] {
  // What each file becomes before collisions are settled. Converted files take
  // the target extension and have no known size, so re-runs match them by name.
  const targets = files.map((f) => {
    const conversion = conversionFor(f.mimeType);
    const name = sanitiseName(f.name);
    const base = { file: f, name, size: f.sizeBytes, contentType: f.mimeType, exportMimeType: undefined as string | undefined };
    if (conversion === "unsupported") return { ...base, skip: NOT_SUPPORTED };
    if (conversion) {
      const { exportMimeType, ext } = conversion;
      return { ...base, name: convertedName(name, ext), size: undefined, contentType: exportMimeType, exportMimeType };
    }
    if (f.sizeBytes !== undefined && f.sizeBytes > MAX_IMPORT_BYTES) return { ...base, skip: TOO_LARGE };
    return base;
  });

  const placed = targets.filter((t) => !("skip" in t));
  const decisions = new Map(decideNames(placed, existing).map((d, i) => [placed[i], d]));

  return targets.map((t): ImportItem => {
    const d = decisions.get(t);
    const name = d?.name ?? t.name;
    const item = {
      id: `${root}${dir}${name}#${t.file.id}`,
      kind: "file" as const,
      fileId: t.file.id,
      name,
      path: dir + name,
      key: root + dir + name,
      contentType: t.contentType,
      size: t.size,
      exportMimeType: t.exportMimeType,
    };
    if ("skip" in t) return { ...item, status: "skipped", reason: t.skip };
    if (d?.action === "skip") return { ...item, status: "skipped", reason: d.reason };
    return { ...item, status: "queued" };
  });
}

/** An empty Drive folder → Storage Browser's zero-byte "name/" placeholder. */
export function folderPlaceholder(root: string, dir: string): ImportItem {
  return {
    id: `${root}${dir}`,
    kind: "folder",
    fileId: "",
    name: dir,
    path: dir,
    key: root + dir,
    contentType: "application/x-directory",
    status: "queued",
  };
}
