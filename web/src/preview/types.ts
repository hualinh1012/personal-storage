import type { ReactNode } from "react";

/**
 * What Storage Browser passes to a custom preview renderer (a subset of its
 * own, unexported FilePreviewProps): the file's metadata and a pre-signed,
 * short-lived URL to read it.
 */
export interface FilePreviewProps {
  fileData: { key: string; size?: number; contentType?: string };
  url: string;
}

/**
 * One previewable file type. Storage Browser ships viewers for "image",
 * "video" and "text"; entries here add new types with their own viewer.
 */
export interface PreviewTypeEntry {
  /** Type name passed to Storage Browser, e.g. "markdown". */
  type: string;
  /** Lower-case file extensions without the dot. */
  extensions: string[];
  /** Content types (without parameters) that also mean this type. */
  contentTypes?: string[];
  /** Viewer component; receives the file's metadata and a short-lived URL. */
  renderer: (props: FilePreviewProps) => ReactNode;
  /** Lower preview size limit for this type, in BYTES; capped at MAX_PREVIEW_BYTES. */
  maxBytes?: number;
}
