/**
 * Moving one file. S3 has no move: copy to the destination, then delete the
 * original, and only if the copy succeeded. Never overwrites an existing file.
 * Storage comes through the drive-storage seam (src/storage), so the rules are
 * tested against the in-memory adapter.
 */
import { reason, type DriveStorage } from "../storage/driveStorage";

export interface MoveItem {
  /** Destination key. */
  key: string;
  /** Current key of the file. */
  sourceKey: string;
}

/** The storage operations a move needs. */
export type MoveStorage = Pick<DriveStorage, "exists" | "copy" | "remove">;

export type MoveResult = { status: "COMPLETE" } | { status: "FAILED"; message: string };

export async function moveFile(item: MoveItem, storage: MoveStorage): Promise<MoveResult> {
  if (item.key === item.sourceKey) return { status: "FAILED", message: "It's already in this folder." };

  try {
    if (await storage.exists(item.key)) {
      return { status: "FAILED", message: "A file with this name already exists in the destination." };
    }
  } catch (error) {
    return { status: "FAILED", message: `Couldn't check the destination (${reason(error)}). Nothing was moved.` };
  }

  try {
    await storage.copy(item.sourceKey, item.key);
  } catch (error) {
    return { status: "FAILED", message: `Couldn't copy it (${reason(error)}). The original wasn't touched.` };
  }

  try {
    await storage.remove(item.sourceKey);
  } catch (error) {
    return {
      status: "FAILED",
      message: `Copied, but the original couldn't be deleted (${reason(error)}), so it's now in both folders.`,
    };
  }
  return { status: "COMPLETE" };
}
