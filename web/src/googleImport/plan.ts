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

export type Decision = { action: "copy"; name: string } | { action: "skip"; reason: string };

export const ALREADY_IMPORTED = "Already imported.";
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
      unclaimed.splice(match, 1);
      return { action: "skip", reason: ALREADY_IMPORTED };
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
  // Where each file would land before collisions: converted files take the target
  // extension and have no known size, so re-runs match them by name alone.
  const targets = files.map((f) => {
    const conversion = conversionFor(f.mimeType);
    if (conversion === "unsupported") return null;
    const name = sanitiseName(f.name);
    return conversion
      ? { file: f, name: convertedName(name, conversion.ext), size: undefined, contentType: conversion.exportMimeType, exportMimeType: conversion.exportMimeType }
      : { file: f, name, size: f.sizeBytes, contentType: f.mimeType, exportMimeType: undefined };
  });
  const placed = targets.filter((t) => t !== null);
  const decisions = decideNames(placed, existing);
  const byFile = new Map(placed.map((t, i) => [t.file, { target: t, decision: decisions[i] }]));
  return files.map((f): ImportItem => {
    const planned = byFile.get(f);
    const d = planned?.decision;
    const name = d?.action === "copy" ? d.name : (planned?.target.name ?? sanitiseName(f.name));
    const item = {
      id: `${root}${dir}${name}#${f.id}`,
      kind: "file" as const,
      fileId: f.id,
      name,
      path: dir + name,
      key: root + dir + name,
      contentType: planned?.target.contentType ?? f.mimeType,
      size: planned?.target.size,
      exportMimeType: planned?.target.exportMimeType,
    };
    if (!d) return { ...item, status: "skipped", reason: NOT_SUPPORTED };
    if (d.action === "skip") return { ...item, status: "skipped", reason: d.reason };
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
