/**
 * The drive's features, in the order their actions appear in the ⋮ menu and
 * their items in the "+ New" menu. The app (pages/Drive.tsx) and the playground
 * both build the drive from this list; DriveView (src/driveHost) wires them.
 */
import type { Access } from "./access";
import type { DriveFeature } from "./driveHost/feature";
import { uploadFeature } from "./driveHost/uploadFeature";
import { editFeature } from "./edit/feature";
import type { GoogleImportDeps } from "./googleImport/deps";
import { googleImportFeature } from "./googleImport/feature";
import { canWriteAt } from "./locationPolicy";
import { moveFeature } from "./move/feature";
import { pagerFeature } from "./pagination/feature";
import { previewFeature } from "./preview/feature";
import type { DriveStorage } from "./storage/driveStorage";
import { trashFeature } from "./trash/feature";

export interface DriveFeatureInputs {
  email: string;
  access: Access;
  /** The files bucket as the signed-in person (S3 in the app, the in-memory drive in the playground). */
  storage: DriveStorage;
  /** Google's side of the import, with the same storage. */
  googleImport: GoogleImportDeps;
  /** Days before S3 removes files in Deleted/ (issue #25); null hides the note. */
  deletedRetentionDays: number | null;
}

export function driveFeatures({ email, access, storage, googleImport, deletedRetentionDays }: DriveFeatureInputs): DriveFeature[] {
  return [
    previewFeature,
    pagerFeature(storage),
    uploadFeature,
    moveFeature(storage),
    googleImportFeature(googleImport),
    editFeature(storage),
    trashFeature({ storage, canWriteTo: canWriteAt(access, email) }, deletedRetentionDays),
  ];
}
