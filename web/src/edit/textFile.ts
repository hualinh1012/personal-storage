/*
 * Opening and saving a text file for the editor (issue #45), over injected S3
 * operations (s3Ops.ts in the app, sample data in the playground).
 *
 * Saving overwrites the file: the last save wins. That's deliberate for a
 * family drive; the bucket is versioned, so the previous text stays
 * recoverable for 30 days (ADR 0006).
 */
import { decodeText, encodeText, MAX_EDIT_BYTES, TEXT_CONTENT_TYPE, type LoadedText, type TextFormat } from "./text";

export interface TextFileOps {
  /** The file's bytes. */
  read(key: string): Promise<Uint8Array>;
  /** Replaces the file. */
  write(key: string, body: Uint8Array, contentType: string): Promise<void>;
}

export async function openText(key: string, ops: TextFileOps): Promise<LoadedText> {
  const body = await ops.read(key);
  // The ⋮ menu already checks the listed size; the file may have grown since.
  if (body.byteLength > MAX_EDIT_BYTES) {
    throw new Error("This file is too big to edit here (over 1 MB). Download it to edit it.");
  }
  return decodeText(body);
}

/** Saves the edited text with the file's original format. Returns the new size in bytes. */
export async function saveText(key: string, text: string, format: TextFormat, ops: TextFileOps): Promise<number> {
  const body = encodeText(text, format);
  await ops.write(key, body, TEXT_CONTENT_TYPE);
  return body.byteLength;
}
