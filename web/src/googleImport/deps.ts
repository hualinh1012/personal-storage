/**
 * What the import view needs from the outside world, so the playground can
 * swap in fakes. `realGoogleImportDeps` is the production wiring: Google's
 * scripts and Drive API on one side, Amplify Storage (the signed-in person's
 * Identity Pool credentials, `Global/*` only) on the other.
 */
import { getProperties, uploadData } from "aws-amplify/storage";
import type { GoogleImportConfig } from "../config";
import { createDriveClient } from "./driveClient";
import { getDriveToken, loadGoogle, pickFiles } from "./google";
import type { PickedFile } from "./plan";

export interface GoogleSide {
  load(): Promise<void>;
  token(clientId: string): Promise<string>;
  pick(cfg: GoogleImportConfig, token: string): Promise<PickedFile[]>;
  download(token: string, fileId: string, signal: AbortSignal): Promise<Blob>;
}

export interface StorageSide {
  exists(key: string): Promise<boolean>;
  upload(key: string, data: Blob, contentType: string, signal: AbortSignal): Promise<void>;
}

export interface GoogleImportDeps {
  /** null while the SSM values are still placeholders. */
  config: GoogleImportConfig | null;
  google: GoogleSide;
  storage: StorageSide;
}

const isNotFound = (error: unknown) =>
  error instanceof Error && (error.name === "NotFound" || /not\s*found|404/i.test(error.message));

export const amplifyStorage: StorageSide = {
  async exists(key) {
    try {
      await getProperties({ path: key });
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  },
  async upload(key, data, contentType, signal) {
    if (signal.aborted) throw signal.reason;
    // Multipart for big files; an aborted upload's parts are cleaned up by the bucket's 7-day rule.
    const task = uploadData({ path: key, data, options: { contentType } });
    const cancel = () => task.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await task.result;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  },
};

export const googleApis: GoogleSide = {
  load: loadGoogle,
  token: getDriveToken,
  pick: pickFiles,
  download: (token, fileId, signal) => createDriveClient(token).download(fileId, signal),
};

export function realGoogleImportDeps(config: GoogleImportConfig | null): GoogleImportDeps {
  return { config, google: googleApis, storage: amplifyStorage };
}
