import type { DriveStorage } from "../storage/driveStorage";
import { countRows } from "./rows";

/**
 * Counts the rows of the folder at `prefix` through the drive-storage seam:
 * one LIST per 1,000 objects, as the signed-in person.
 */
export async function countFolder(storage: Pick<DriveStorage, "listFolder">, prefix: string): Promise<number> {
  return countRows(await storage.listFolder(prefix), prefix);
}
