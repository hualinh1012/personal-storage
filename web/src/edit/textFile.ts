/*
 * Opening and saving a text file for the editor (issue #45), over the
 * drive-storage seam (src/storage: S3 in the app, the in-memory drive in the
 * playground and tests).
 *
 * Saving overwrites the file: the last save wins. That's deliberate for a
 * family drive; the bucket is versioned, so the previous text stays
 * recoverable for 30 days (ADR 0006).
 */
import type { DriveStorage } from "../storage/driveStorage";
import { decodeText, encodeText, MAX_EDIT_BYTES, TEXT_CONTENT_TYPE, type LoadedText, type TextFormat } from "./text";

/** The storage operations the editor needs. */
export type TextFileStorage = Pick<DriveStorage, "read" | "write">;

export async function openText(key: string, storage: TextFileStorage): Promise<LoadedText> {
  const body = await storage.read(key);
  // The ⋮ menu already checks the listed size; the file may have grown since.
  if (body.byteLength > MAX_EDIT_BYTES) {
    throw new Error("This file is too big to edit here (over 1 MB). Download it to edit it.");
  }
  return decodeText(body);
}

/** Saves the edited text with the file's original format. Returns the new size in bytes. */
export async function saveText(key: string, text: string, format: TextFormat, storage: TextFileStorage): Promise<number> {
  const body = encodeText(text, format);
  await storage.write(key, body, { contentType: TEXT_CONTENT_TYPE });
  return body.byteLength;
}
