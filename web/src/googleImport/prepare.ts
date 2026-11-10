import type { DriveClient } from "./driveClient";
import { FOLDER_MIME, listFolderTree } from "./listing";
import { folderPlaceholder, planFolder, type ExistingFile, type ImportItem, type PickedFile } from "./plan";
import type { RetryOptions } from "./retry";

export interface PreparedImport {
  items: ImportItem[];
  /** What the person picked, for "N files, M folders selected". */
  pickedFiles: number;
  pickedFolders: number;
}

export interface PrepareDeps {
  drive: Pick<DriveClient, "listChildren">;
  /** Files directly in a destination folder; [] when it doesn't exist yet. */
  listExisting(prefix: string): Promise<ExistingFile[]>;
  retry?: RetryOptions;
}

/**
 * Picked files and folders → the full import plan under `root` (the open
 * folder). Folders are walked recursively; each destination folder is listed
 * once and the re-run rules apply within it. Folders that already exist are
 * merged into; empty Drive folders become placeholders.
 */
export async function prepareImport(picked: PickedFile[], root: string, deps: PrepareDeps): Promise<PreparedImport> {
  const byDir = new Map<string, PickedFile[]>();
  const add = (dir: string, f: PickedFile) => byDir.set(dir, [...(byDir.get(dir) ?? []), f]);
  const emptyDirs: string[] = [];

  for (const p of picked) {
    if (p.mimeType !== FOLDER_MIME) {
      add("", p);
      continue;
    }
    const tree = await listFolderTree(deps.drive, p, deps.retry);
    for (const { file, dir } of tree.files) add(dir, { id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.size });
    emptyDirs.push(...tree.emptyDirs);
  }

  const items: ImportItem[] = [];
  for (const [dir, files] of byDir) {
    items.push(...planFolder(files, root, dir, await deps.listExisting(root + dir)));
  }
  for (const dir of new Set(emptyDirs)) items.push(folderPlaceholder(root, dir));

  const pickedFolders = picked.filter((p) => p.mimeType === FOLDER_MIME).length;
  return { items, pickedFiles: picked.length - pickedFolders, pickedFolders };
}
