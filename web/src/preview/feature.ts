import type { DriveFeature } from "../driveHost/feature";
import { filePreviewConfig, previewDisplayText } from "./registry";

/** File preview beside the list: our extra viewers (registry.ts) and the "too big" wording. */
export const previewFeature: DriveFeature = {
  name: "preview",
  filePreview: filePreviewConfig,
  displayText: previewDisplayText,
};
