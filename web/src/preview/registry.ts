import MarkdownPreview from "./MarkdownPreview";
import PdfPreviewLazy from "./PdfPreviewLazy";
import type { PreviewTypeEntry } from "./types";

/*
 * File types the drive previews beyond Storage Browser's built-in ones.
 *
 * Built in (no entry needed): "image", "video", "text", detected by Storage
 * Browser from the content type or extension, with its own viewers. Anything
 * else shows "no preview" with a download button.
 *
 * To support a new type: add a viewer component in this folder and one entry
 * below. Load heavy viewer libraries lazily (see PdfPreviewLazy).
 */
export const PREVIEW_TYPES: PreviewTypeEntry[] = [
  {
    type: "markdown",
    extensions: ["md", "markdown"],
    contentTypes: ["text/markdown", "text/x-markdown"],
    renderer: MarkdownPreview,
  },
  {
    type: "pdf",
    extensions: ["pdf"],
    contentTypes: ["application/pdf"],
    renderer: PdfPreviewLazy,
  },
];

/**
 * Largest file any type may preview, in bytes. Storage Browser refuses files
 * whose size is greater than this and shows `previewDisplayText` instead.
 * An entry's own `maxBytes` can only lower it.
 */
export const MAX_PREVIEW_BYTES = 50 * 1024 * 1024;

/** Overrides for Storage Browser's "too large to preview" message. */
export const previewDisplayText = {
  LocationDetailView: {
    filePreview: {
      sizeLimitMessage: "File is too big to preview",
      fileSizeLimitDescription: "Previews are available for files up to 50 MB. Download the file to open it.",
    },
  },
};

const byType = new Map(PREVIEW_TYPES.map((entry) => [entry.type, entry]));

function extensionOf(key: string): string | undefined {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : undefined;
}

/**
 * Preview type for a file from this registry, by extension first, then content
 * type. `undefined` hands the file to Storage Browser's built-in detection.
 */
export function resolvePreviewType(file: { key: string; contentType?: string }): string | undefined {
  const extension = extensionOf(file.key);
  const contentType = file.contentType?.split(";")[0].trim().toLowerCase();
  const entry =
    PREVIEW_TYPES.find((e) => extension !== undefined && e.extensions.includes(extension)) ??
    PREVIEW_TYPES.find((e) => contentType !== undefined && e.contentTypes?.includes(contentType));
  return entry?.type;
}

/** The `filePreview` option for createStorageBrowser. */
export const filePreviewConfig = {
  fileTypeResolver: resolvePreviewType,
  rendererResolver: (fileType: string) => byType.get(fileType)?.renderer,
  maxFileSize: (fileType: string) => Math.min(byType.get(fileType)?.maxBytes ?? MAX_PREVIEW_BYTES, MAX_PREVIEW_BYTES),
};
