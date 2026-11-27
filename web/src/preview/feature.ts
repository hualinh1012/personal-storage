import type { DriveFeature } from "../driveHost/feature";
import { FileViewer } from "./FileViewer";
import { filePreviewConfig, previewDisplayText } from "./registry";

/**
 * Opening a file: the viewer popup and the View info panel (FileViewer), our
 * extra viewers (registry.ts) and the "too big" wording.
 */
export const previewFeature: DriveFeature = {
  name: "preview",
  filePreview: filePreviewConfig,
  displayText: previewDisplayText,
  components: { FilePreview: FileViewer },
};
