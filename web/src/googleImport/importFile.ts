import { DriveError } from "./driveClient";
import { withRetry, type RetryOptions } from "./retry";
import type { Outcome } from "./queue";

/** Storage and Drive operations, injected so the rules can be tested without either. */
export interface ImportOps {
  exists(key: string): Promise<boolean>;
  download(fileId: string, signal: AbortSignal): Promise<Blob>;
  upload(key: string, data: Blob, contentType: string, signal: AbortSignal): Promise<void>;
}

export interface ImportTarget {
  /** Google file ID. */
  id: string;
  key: string;
  contentType: string;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

function driveReason(error: unknown): string {
  if (!(error instanceof DriveError)) return `Couldn't download it from Google Drive (${reason(error)}).`;
  if (error.status === 404) return "Not found in Google Drive (deleted, or no access).";
  if (error.status === 403 || error.status === 429) return "Google Drive is busy or refused access; try again later.";
  return `Couldn't download it from Google Drive (HTTP ${error.status}).`;
}

/**
 * Copies one Google Drive file to `key`. Never overwrites: an existing key is
 * skipped before anything is downloaded.
 */
export async function importFile(
  target: ImportTarget,
  ops: ImportOps,
  signal: AbortSignal,
  retry: RetryOptions = {},
): Promise<Outcome> {
  try {
    if (await ops.exists(target.key)) return { status: "skipped", reason: "Already exists." };
  } catch (error) {
    return { status: "failed", reason: `Couldn't check Family Drive (${reason(error)}).` };
  }

  let data: Blob;
  try {
    data = await withRetry(() => ops.download(target.id, signal), { ...retry, signal });
  } catch (error) {
    return { status: "failed", reason: driveReason(error) };
  }

  try {
    await ops.upload(target.key, data, target.contentType, signal);
  } catch (error) {
    return { status: "failed", reason: `Couldn't save it to Family Drive (${reason(error)}).` };
  }
  return { status: "done", bytes: data.size };
}
