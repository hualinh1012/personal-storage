/*
 * Rules for editing text files in the drive (issue #45). Pure, so they're
 * tested without S3 or a browser.
 *
 * Files are UTF-8. A textarea only knows "\n", so the file's line endings and
 * a leading byte-order mark are remembered on load and put back on save: an
 * edit changes only what the person typed.
 */

/** Extensions the Edit action opens (lower-case, no dot). */
export const EDITABLE_EXTENSIONS = ["txt"];

/** Largest file the editor opens, in bytes. Bigger files keep the read-only preview. */
export const MAX_EDIT_BYTES = 1024 * 1024;

/** Content type a saved file gets. */
export const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

const BOM = "﻿";

export interface TextFormat {
  bom: boolean;
  eol: "\n" | "\r\n";
}

export interface LoadedText {
  /** The text with "\n" line endings and no BOM, as the textarea shows it. */
  text: string;
  format: TextFormat;
}

function extensionOf(key: string): string | undefined {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : undefined;
}

/** File name shown in the editor's title. */
export const fileName = (key: string) => key.slice(key.lastIndexOf("/") + 1);

/** Whether Edit is offered for a selected item: one text file, small enough to edit. */
export function isEditable(item: { key: string; type?: string; size?: number }): boolean {
  if (item.type !== undefined && item.type !== "FILE") return false;
  const extension = extensionOf(item.key);
  if (!extension || !EDITABLE_EXTENSIONS.includes(extension)) return false;
  return item.size === undefined || item.size <= MAX_EDIT_BYTES;
}

/** Edit's enable rule for Storage Browser's ⋮ menu: exactly one editable file selected. */
export function canEditSelection(selected?: { key: string; type?: string; size?: number }[]): boolean {
  return !!selected && selected.length === 1 && isEditable(selected[0]);
}

/**
 * Decodes a file for editing. Throws when it isn't valid UTF-8, rather than
 * replacing characters and then saving the damage back.
 */
export function decodeText(bytes: Uint8Array): LoadedText {
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("This file isn't UTF-8 text, so it can't be edited here. Download it to edit it.");
  }
  const bom = raw.startsWith(BOM);
  const body = bom ? raw.slice(1) : raw;
  // The first line ending decides; mixed files are saved with that one.
  const first = body.search(/\r\n|\n/);
  const eol = first !== -1 && body[first] === "\r" ? "\r\n" : "\n";
  return { text: body.replace(/\r\n/g, "\n"), format: { bom, eol } };
}

/** Encodes the edited text back with the file's original BOM and line endings. */
export function encodeText(text: string, format: TextFormat): Uint8Array {
  const lf = text.replace(/\r\n/g, "\n");
  const body = format.eol === "\r\n" ? lf.replace(/\n/g, "\r\n") : lf;
  return new TextEncoder().encode((format.bom ? BOM : "") + body);
}
