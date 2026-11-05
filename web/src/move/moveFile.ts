/**
 * Moving one file. S3 has no move: copy to the destination, then delete the
 * original, and only if the copy succeeded. Never overwrites an existing file.
 * Storage operations are injected so the rules can be tested without S3.
 */

export interface MoveItem {
  /** Destination key. */
  key: string;
  /** Current key of the file. */
  sourceKey: string;
  lastModified?: Date;
  eTag?: string;
}

export interface MoveOps {
  exists(key: string): Promise<boolean>;
  copy(item: MoveItem): Promise<void>;
  remove(key: string): Promise<void>;
}

export type MoveResult = { status: "COMPLETE" } | { status: "FAILED"; message: string };

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function moveFile(item: MoveItem, ops: MoveOps): Promise<MoveResult> {
  if (item.key === item.sourceKey) return { status: "FAILED", message: "It's already in this folder." };

  try {
    if (await ops.exists(item.key)) {
      return { status: "FAILED", message: "A file with this name already exists in the destination." };
    }
  } catch (error) {
    return { status: "FAILED", message: `Couldn't check the destination (${reason(error)}). Nothing was moved.` };
  }

  try {
    await ops.copy(item);
  } catch (error) {
    return { status: "FAILED", message: `Couldn't copy it (${reason(error)}). The original wasn't touched.` };
  }

  try {
    await ops.remove(item.sourceKey);
  } catch (error) {
    return {
      status: "FAILED",
      message: `Copied, but the original couldn't be deleted (${reason(error)}), so it's now in both folders.`,
    };
  }
  return { status: "COMPLETE" };
}
