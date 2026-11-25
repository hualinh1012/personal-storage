import type { DriveFeature } from "../driveHost/feature";
import type { DriveStorage } from "../storage/driveStorage";
import { countFolder } from "./countFolder";
import { createFolderTracker } from "./folderTracker";
import { makePager } from "./Pager";

/**
 * The pager (replaces Storage Browser's `Pagination`): "Page X of N · M items".
 * It watches the file list's listing to recount the open folder through the
 * drive storage, since S3 never reports a prefix's size.
 */
export function pagerFeature(storage: Pick<DriveStorage, "listFolder">): DriveFeature {
  const tracker = createFolderTracker((prefix) => countFolder(storage, prefix));
  return {
    name: "pager",
    wrapList: tracker.wrap,
    components: { Pagination: makePager(tracker) },
  };
}
