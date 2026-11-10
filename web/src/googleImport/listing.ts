import type { DriveClient, DriveFile } from "./driveClient";
import { sanitiseName } from "./names";
import { withRetry, type RetryOptions } from "./retry";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

/** A file found under a picked folder; `dir` is its folder path relative to the destination, ending in "/". */
export interface ListedFile {
  file: DriveFile;
  dir: string;
}

export interface FolderTree {
  files: ListedFile[];
  /** Folders with nothing in them (relative paths ending in "/"), to recreate as placeholders. */
  emptyDirs: string[];
}

/**
 * Walks a picked Drive folder recursively, following every page, and returns
 * its files with their folder paths. The folder's own name is the first path
 * segment, so picking "Photos" lands everything under "Photos/".
 */
export async function listFolderTree(
  client: Pick<DriveClient, "listChildren">,
  folder: { id: string; name: string },
  retry: RetryOptions = {},
): Promise<FolderTree> {
  const tree: FolderTree = { files: [], emptyDirs: [] };
  const walk = async (id: string, dir: string) => {
    let pageToken: string | undefined;
    let empty = true;
    do {
      const page = await withRetry(() => client.listChildren(id, pageToken, retry.signal), retry);
      for (const f of page.files) {
        empty = false;
        if (f.mimeType === FOLDER_MIME) await walk(f.id, `${dir}${sanitiseName(f.name)}/`);
        else tree.files.push({ file: f, dir });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    if (empty) tree.emptyDirs.push(dir);
  };
  await walk(folder.id, `${sanitiseName(folder.name)}/`);
  return tree;
}
