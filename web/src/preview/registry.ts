import MarkdownPreview from "./MarkdownPreview";
import type { PreviewTypeEntry } from "./types";

/*
 * File types the drive previews beyond Storage Browser's built-in ones.
 *
 * Built in (no entry needed): "image", "video", "text", detected by Storage
 * Browser from the content type or extension, with its own viewers and limits
 * (image 200 MB, video 2 GB, text 10 MB). Anything else shows "no preview"
 * with a download button.
 *
 * To support a new type (e.g. PDF): add a viewer component in this folder
 * and one entry below.
 */
export const PREVIEW_TYPES: PreviewTypeEntry[] = [
  {
    type: "markdown",
    extensions: ["md", "markdown"],
    contentTypes: ["text/markdown", "text/x-markdown"],
    renderer: MarkdownPreview,
    maxBytes: 10 * 1024 * 1024,
  },
];

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
  maxFileSize: (fileType: string) => byType.get(fileType)?.maxBytes,
};
