/**
 * What the import view needs from the outside world, so the playground can
 * swap in fakes: Google's scripts and Drive API on one side, the drive storage
 * (src/storage: S3 as the signed-in person in the app, `Global/*` and their own
 * `Personal/<email>/*`; the in-memory drive in the playground) on the other.
 */
import type { GoogleImportConfig } from "../config";
import type { DriveStorage } from "../storage/driveStorage";
import { createDriveClient, type DriveClient } from "./driveClient";
import { getDriveToken, loadGoogle, pickFiles } from "./google";
import type { ExistingFile, PickedFile } from "./plan";

export interface GoogleSide {
  load(): Promise<void>;
  token(clientId: string): Promise<string>;
  pick(cfg: GoogleImportConfig, token: string): Promise<PickedFile[]>;
  /** Drive API calls made with this token. */
  drive(token: string): DriveClient;
}

/** The storage operations an import needs. */
export type ImportStorage = Pick<DriveStorage, "listFolder" | "exists" | "write">;

export interface GoogleImportDeps {
  /** null while the SSM values are still placeholders. */
  config: GoogleImportConfig | null;
  google: GoogleSide;
  storage: ImportStorage;
}

/** Files directly under `prefix` (not in subfolders, not folder placeholders), names relative to it. */
export async function existingFiles(storage: Pick<DriveStorage, "listFolder">, prefix: string): Promise<ExistingFile[]> {
  const { files } = await storage.listFolder(prefix);
  return files.filter((f) => f.key !== prefix && !f.key.endsWith("/")).map((f) => ({ name: f.key.slice(prefix.length), size: f.size }));
}

export const googleApis: GoogleSide = {
  load: loadGoogle,
  token: getDriveToken,
  pick: pickFiles,
  drive: (token) => createDriveClient(token),
};

export function realGoogleImportDeps(config: GoogleImportConfig | null, storage: ImportStorage): GoogleImportDeps {
  return { config, google: googleApis, storage };
}
