/**
 * The Deleted folder's rules (issue #24, ADR 0011), with S3 injected so they
 * can be tested without AWS:
 *
 * - Delete moves a file to Deleted/ (copy, then delete the original only if the
 *   copy worked). Folders move every file under them.
 * - Restore puts a file back where it was, never over an existing file, and then
 *   removes it from Deleted/ completely.
 * - Delete permanently and Empty Deleted remove every version, so nothing is
 *   left to recover in the console either.
 */
import { DELETED_PREFIX } from "../config";
import { deletedKey, originalKey, randomTag } from "./paths";

export interface ObjectVersion {
  key: string;
  versionId: string;
}

export interface TrashOps {
  exists(key: string): Promise<boolean>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every object key under a prefix, including folder placeholders (keys ending in "/"). */
  listKeys(prefix: string): Promise<string[]>;
  /** Every version and delete marker under a prefix. */
  listVersions(prefix: string): Promise<ObjectVersion[]>;
  removeVersion(version: ObjectVersion): Promise<void>;
}

export type Outcome = { status: "COMPLETE" } | { status: "FAILED"; message: string };

const COMPLETE: Outcome = { status: "COMPLETE" };
const failed = (message: string): Outcome => ({ status: "FAILED", message });
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isFolder = (key: string) => key.endsWith("/");
const fileName = (key: string) => key.slice(key.lastIndexOf("/") + 1);

/** Runs a file rule over a single file, or over every file under a folder. */
async function eachFile(
  key: string,
  ops: TrashOps,
  onFile: (fileKey: string) => Promise<Outcome>,
  onPlaceholder: (placeholderKey: string) => Promise<void>,
  verb: string,
): Promise<Outcome> {
  if (!isFolder(key)) return onFile(key);

  let keys: string[];
  try {
    keys = await ops.listKeys(key);
  } catch (error) {
    return failed(`Couldn't list the folder (${reason(error)}). Nothing was ${verb}.`);
  }
  const files = keys.filter((k) => !isFolder(k));
  const problems: string[] = [];
  for (const file of files) {
    const outcome = await onFile(file);
    if (outcome.status === "FAILED") problems.push(`${fileName(file)}: ${outcome.message}`);
  }
  // Folder placeholders only exist to show empty folders; they go once the files have.
  if (problems.length === 0) {
    for (const placeholder of keys.filter(isFolder)) {
      try {
        await onPlaceholder(placeholder);
      } catch {
        // A leftover empty folder is harmless.
      }
    }
    return COMPLETE;
  }
  return failed(`${problems.length} of ${files.length} files weren't ${verb}. ${problems.slice(0, 3).join(" ")}`);
}

export interface Clock {
  now(): Date;
  tag(): string;
}

export const systemClock: Clock = { now: () => new Date(), tag: randomTag };

/** Delete: moves a file, or every file in a folder, into the Deleted folder. */
export function moveToDeleted(key: string, ops: TrashOps, clock: Clock = systemClock): Promise<Outcome> {
  return eachFile(
    key,
    ops,
    async (file) => {
      try {
        await ops.copy(file, deletedKey(file, clock.now(), clock.tag()));
      } catch (error) {
        return failed(`Couldn't move it to Deleted (${reason(error)}). The file wasn't touched.`);
      }
      try {
        await ops.remove(file);
      } catch (error) {
        return failed(`Copied to Deleted, but the original couldn't be removed (${reason(error)}), so it's in both places.`);
      }
      return COMPLETE;
    },
    (placeholder) => ops.remove(placeholder),
    "moved to Deleted",
  );
}

/** Every version of one key (exact) or of everything under a folder prefix. */
async function purge(key: string, ops: TrashOps): Promise<void> {
  const versions = (await ops.listVersions(key)).filter((v) => (isFolder(key) ? v.key.startsWith(key) : v.key === key));
  for (const version of versions) await ops.removeVersion(version);
}

/** Delete permanently: removes a file, or a folder, from the Deleted folder with every version. */
export async function deletePermanently(key: string, ops: TrashOps): Promise<Outcome> {
  if (!key.startsWith(DELETED_PREFIX)) return failed("Only files in Deleted can be deleted permanently.");
  try {
    await purge(key, ops);
    return COMPLETE;
  } catch (error) {
    return failed(`Couldn't delete it permanently (${reason(error)}). Some versions may be left.`);
  }
}

/**
 * Restore: puts a file (or every file in a folder) back at its original key.
 * `canWriteTo` says whether the signed-in person may write there; IAM decides
 * anyway, this just gives a clear message instead of AccessDenied.
 */
export function restore(key: string, ops: TrashOps, canWriteTo: (key: string) => boolean): Promise<Outcome> {
  return eachFile(
    key,
    ops,
    async (file) => {
      const original = originalKey(file);
      if (!original) return failed("Its original place is unknown (it wasn't put here by Delete).");
      if (!canWriteTo(original)) return failed(cantWriteMessage(original));
      try {
        if (await ops.exists(original)) return failed(`A file with this name is already at ${original}.`);
      } catch (error) {
        return failed(`Couldn't check ${original} (${reason(error)}). Nothing was restored.`);
      }
      try {
        await ops.copy(file, original);
      } catch (error) {
        return failed(`Couldn't restore it (${reason(error)}). It's still in Deleted.`);
      }
      try {
        await purge(file, ops);
      } catch (error) {
        return failed(`Restored, but couldn't be removed from Deleted (${reason(error)}), so it's in both places.`);
      }
      return COMPLETE;
    },
    (placeholder) => purge(placeholder, ops),
    "restored",
  );
}

function cantWriteMessage(original: string): string {
  const personal = /^Personal\/([^/]+)\//.exec(original);
  if (personal) return `It was in ${personal[1]}'s personal folder, which only they can write to.`;
  return `You can't add files to the shared drive, so you can't restore it there.`;
}

export interface EmptySummary {
  /** Versions and delete markers removed. */
  removed: number;
  failed: number;
  firstError?: string;
}

/** Empty Deleted: removes everything in the Deleted folder, every version. */
export async function emptyDeleted(ops: TrashOps, onProgress?: (done: number, total: number) => void): Promise<EmptySummary> {
  const versions = await ops.listVersions(DELETED_PREFIX);
  const summary: EmptySummary = { removed: 0, failed: 0 };
  for (const version of versions) {
    try {
      await ops.removeVersion(version);
      summary.removed++;
    } catch (error) {
      summary.failed++;
      summary.firstError ??= `${fileName(version.key) || version.key}: ${reason(error)}`;
    }
    onProgress?.(summary.removed + summary.failed, versions.length);
  }
  return summary;
}
